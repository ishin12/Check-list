/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mock Supabase client for demo mode.
 *
 * Quacks like @supabase/supabase-js for the narrow surface this app uses:
 *   - auth.signInWithOtp / getSession / onAuthStateChange / signOut
 *   - from(table).select/insert/update/upsert/delete + chainable filters
 *   - storage.from('proofs').upload
 *   - channel(name).on('postgres_changes', filter, cb).subscribe()
 *   - removeChannel(sub)
 *
 * Persistence is IndexedDB so data and proof blobs survive reloads.
 * Triggers in `0001_init.sql` are mirrored here so behaviour carries over 1:1.
 *
 * Exposes window.__demo for the role switcher and Settings reset button.
 */
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'checklist-demo';
const DB_VERSION = 1;

const TABLES = [
  'profiles',
  'clients',
  'templates',
  'tasks',
  'task_proofs',
  'client_notes',
  'notifications',
  'audit_log',
] as const;
type Table = typeof TABLES[number];

interface Row { id: string; [k: string]: any }

// ---------------------------------------------------------------------------
// State (in-memory mirror of IDB for fast synchronous reads from the builder)
// ---------------------------------------------------------------------------

const state: Record<Table, Row[]> = {
  profiles: [],
  clients: [],
  templates: [],
  tasks: [],
  task_proofs: [],
  client_notes: [],
  notifications: [],
  audit_log: [],
};
const blobs: Map<string, Blob> = new Map();

let activeUserId = 'u-mgr';
let dbPromise: Promise<IDBPDatabase> | null = null;
let ready: Promise<void> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        for (const t of TABLES) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      },
    });
  }
  return dbPromise;
}

async function loadAll(): Promise<void> {
  const conn = await db();
  for (const t of TABLES) {
    const rows = await conn.getAll(t);
    state[t] = rows as Row[];
  }
  const blobKeys = await conn.getAllKeys('blobs');
  for (const k of blobKeys) {
    const v = (await conn.get('blobs', k)) as Blob | undefined;
    if (v) blobs.set(String(k), v);
  }
  const seeded = await conn.get('meta', 'seeded');
  if (!seeded) await seedDemo();
  const u = await conn.get('meta', 'activeUserId');
  if (typeof u === 'string') activeUserId = u;
}

function ensureReady(): Promise<void> {
  if (!ready) ready = loadAll();
  return ready;
}

async function persist(table: Table): Promise<void> {
  const conn = await db();
  const tx = conn.transaction(table, 'readwrite');
  await tx.store.clear();
  for (const row of state[table]) await tx.store.put(row);
  await tx.done;
}

// ---------------------------------------------------------------------------
// Auth state (subscribers fire SIGNED_IN/SIGNED_OUT)
// ---------------------------------------------------------------------------

type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'INITIAL_SESSION';
type AuthCallback = (event: AuthEvent, session: { user: { id: string; email: string | null } } | null) => void;
const authSubs = new Set<AuthCallback>();

function currentSession() {
  if (!activeUserId) return null;
  const profile = state.profiles.find((p) => p.id === activeUserId);
  return { user: { id: activeUserId, email: profile?.email ?? null } };
}

function emitAuth(event: AuthEvent): void {
  const session = currentSession();
  for (const cb of authSubs) cb(event, session);
}

// ---------------------------------------------------------------------------
// Realtime channels (we only support postgres_changes INSERT on notifications)
// ---------------------------------------------------------------------------

interface Subscription {
  table: Table;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: { col: string; val: string };
  cb: (payload: { new: Row }) => void;
}
const subscriptions = new Set<Subscription>();

function fireChange(table: Table, event: Subscription['event'], row: Row): void {
  for (const s of subscriptions) {
    if (s.table !== table) continue;
    if (s.event !== event && s.event !== '*') continue;
    if (s.filter) {
      const want = String(s.filter.val);
      if (String(row[s.filter.col]) !== want) continue;
    }
    try { s.cb({ new: row }); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Trigger emulation (mirrors 0001_init.sql)
// ---------------------------------------------------------------------------

function audit(action: string, entity: string, entityId: string | null, payload: Record<string, unknown> = {}): void {
  const row: Row = {
    id: crypto.randomUUID(),
    actor_id: activeUserId,
    action,
    entity,
    entity_id: entityId,
    payload,
    at: new Date().toISOString(),
  };
  state.audit_log.unshift(row);
  void persist('audit_log');
}

function notify(userId: string, kind: string, payload: Record<string, unknown>): void {
  const row: Row = {
    id: crypto.randomUUID(),
    user_id: userId,
    kind,
    payload,
    read_at: null,
    email_sent_at: null,
    created_at: new Date().toISOString(),
  };
  state.notifications.unshift(row);
  void persist('notifications');
  fireChange('notifications', 'INSERT', row);
}

function onTaskInsert(task: Row): void {
  notify(task.assigned_worker_id, 'task.assigned', {
    task_id: task.id, title: task.title, scheduled_at: task.scheduled_at,
  });
  audit('task.created', 'task', task.id, { status: task.status });
}

function onTaskUpdate(prev: Row, next: Row): void {
  if (prev.status !== next.status) {
    audit(`task.${next.status}`, 'task', next.id, { status: next.status });
    if (next.status === 'submitted') {
      for (const m of state.profiles.filter((p) => p.role === 'manager' && p.active)) {
        notify(m.id, 'task.submitted', {
          task_id: next.id, title: next.title, worker_id: next.assigned_worker_id,
        });
      }
    } else if (next.status === 'approved' || next.status === 'rejected') {
      notify(next.assigned_worker_id, `task.${next.status}`, {
        task_id: next.id, title: next.title,
      });
    }
  } else {
    audit('task.updated', 'task', next.id, {});
  }
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';
interface SelectEmbed { alias: string; table: Table; cols: string[] }

class Query<T = any> implements PromiseLike<{ data: T; error: { message: string } | null }> {
  private op: Op = 'select';
  private embeds: SelectEmbed[] = [];
  private filters: Array<(r: Row) => boolean> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private payload: Row | Row[] | null = null;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';

  constructor(private readonly table: Table) {}

  // -- mutating chain ops ----------------------------------------------------
  select(cols = '*'): this {
    this.embeds = parseEmbeds(cols);
    return this;
  }
  insert(data: Row | Row[]): this { this.op = 'insert'; this.payload = data; return this; }
  update(data: Row): this { this.op = 'update'; this.payload = data; return this; }
  upsert(data: Row | Row[]): this { this.op = 'upsert'; this.payload = data; return this; }
  delete(): this { this.op = 'delete'; return this; }

  eq(col: string, val: unknown): this {
    this.filters.push((r) => String(r[col] ?? '') === String(val ?? ''));
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push((r) => (r[col] ?? '') >= (val as any));
    return this;
  }
  lte(col: string, val: unknown): this {
    this.filters.push((r) => (r[col] ?? '') <= (val as any));
    return this;
  }
  is(col: string, val: null | boolean): this {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}): this {
    this.orderBy = { col, asc: opts.ascending !== false };
    return this;
  }
  limit(n: number): this { this.limitN = n; return this; }
  single(): this { this.singleMode = 'single'; return this; }
  maybeSingle(): this { this.singleMode = 'maybe'; return this; }

  // -- thenable: await runs the query ----------------------------------------
  then<TR1 = any, TR2 = never>(
    onFulfilled?: ((v: { data: any; error: { message: string } | null }) => TR1 | PromiseLike<TR1>) | null,
    onRejected?: ((reason: any) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    return ensureReady().then(() => this.run()).then(onFulfilled as any, onRejected as any);
  }

  private filterRows(): Row[] {
    let rows = state[this.table].slice();
    for (const f of this.filters) rows = rows.filter(f);
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows.sort((a, b) => {
        const av = a[col]; const bv = b[col];
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  private project(row: Row): Row {
    const projected: Row = { ...row };
    for (const emb of this.embeds) {
      const fkCol = guessFkCol(this.table, emb.table, emb.alias);
      const target = state[emb.table].find((r) => r.id === row[fkCol]);
      projected[emb.alias] = target ? [pick(target, emb.cols)] : [];
    }
    return projected;
  }

  private run(): { data: any; error: { message: string } | null } {
    try {
      switch (this.op) {
        case 'select': {
          const rows = this.filterRows().map((r) => this.project(r));
          return formatResult(rows, this.singleMode);
        }
        case 'insert': {
          const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
          const inserted: Row[] = [];
          for (const data of list) {
            const row: Row = withDefaults(this.table, { ...data, id: data.id ?? crypto.randomUUID() });
            state[this.table].push(row);
            inserted.push(row);
            void persist(this.table);
            if (this.table === 'tasks') onTaskInsert(row);
          }
          return formatResult(inserted, this.singleMode);
        }
        case 'update': {
          const target = this.filterRows();
          const updated: Row[] = [];
          for (const row of target) {
            const prev = { ...row };
            Object.assign(row, this.payload as Row, { updated_at: new Date().toISOString() });
            updated.push(row);
            if (this.table === 'tasks') onTaskUpdate(prev, row);
          }
          void persist(this.table);
          return formatResult(updated, this.singleMode);
        }
        case 'upsert': {
          const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
          const out: Row[] = [];
          for (const data of list) {
            const idx = state[this.table].findIndex((r) => r.id === data.id);
            if (idx >= 0) {
              Object.assign(state[this.table][idx], data, { updated_at: new Date().toISOString() });
              out.push(state[this.table][idx]);
            } else {
              const row = withDefaults(this.table, { ...data, id: data.id ?? crypto.randomUUID() });
              state[this.table].push(row); out.push(row);
            }
          }
          void persist(this.table);
          return formatResult(out, this.singleMode);
        }
        case 'delete': {
          const target = this.filterRows();
          const ids = new Set(target.map((r) => r.id));
          state[this.table] = state[this.table].filter((r) => !ids.has(r.id));
          void persist(this.table);
          return formatResult(target, this.singleMode);
        }
      }
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
}

function formatResult(rows: Row[], mode: 'none' | 'single' | 'maybe') {
  if (mode === 'single') {
    if (rows.length === 0) return { data: null, error: { message: 'No rows' } };
    return { data: rows[0], error: null };
  }
  if (mode === 'maybe') {
    return { data: rows[0] ?? null, error: null };
  }
  return { data: rows, error: null };
}

function pick(row: Row, cols: string[]): Row {
  const out: Row = {} as Row;
  out.id = row.id;
  for (const c of cols) out[c] = row[c] ?? null;
  return out;
}

/** Parse `actor:profiles!audit_log_actor_id_fkey(full_name, email)` embeds out of a select string. */
function parseEmbeds(sel: string): SelectEmbed[] {
  if (!sel.includes(':')) return [];
  const out: SelectEmbed[] = [];
  const rx = /(\w+):(\w+)!?[\w_]*\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(sel))) {
    const cols = m[3].split(',').map((s) => s.trim());
    out.push({ alias: m[1], table: m[2] as Table, cols });
  }
  return out;
}

function guessFkCol(from: Table, _to: Table, alias: string): string {
  // The only embed currently in use: audit_log.actor → profiles. Map by alias.
  if (from === 'audit_log' && alias === 'actor') return 'actor_id';
  return `${alias}_id`;
}

function withDefaults(table: Table, row: Row): Row {
  const now = new Date().toISOString();
  const base = { ...row };
  if (table === 'clients' || table === 'templates' || table === 'tasks') {
    base.created_at ??= now;
    base.updated_at ??= now;
  }
  if (table === 'tasks') {
    base.status ??= 'not_started';
    base.results ??= [];
    base.created_by ??= activeUserId;
  }
  if (table === 'client_notes') {
    base.created_at ??= now;
    base.status ??= 'open';
    base.created_by ??= activeUserId;
  }
  if (table === 'task_proofs') {
    base.uploaded_at ??= now;
    base.uploaded_by ??= activeUserId;
  }
  if (table === 'notifications') {
    base.created_at ??= now;
    base.read_at ??= null;
    base.email_sent_at ??= null;
    base.payload ??= {};
  }
  return base;
}

// ---------------------------------------------------------------------------
// Public mock client (shape-compatible with @supabase/supabase-js subset)
// ---------------------------------------------------------------------------

export interface MockClient {
  auth: {
    getSession(): Promise<{ data: { session: ReturnType<typeof currentSession> } }>;
    onAuthStateChange(cb: AuthCallback): { data: { subscription: { unsubscribe(): void } } };
    signInWithOtp(args: { email: string; options?: unknown }): Promise<{ error: null }>;
    signOut(): Promise<void>;
  };
  from(table: Table): Query;
  storage: {
    from(bucket: 'proofs'): {
      upload(path: string, blob: Blob, opts?: { contentType?: string; upsert?: boolean }): Promise<{ error: null }>;
    };
  };
  channel(name: string): {
    on(event: 'postgres_changes', filter: any, cb: Subscription['cb']): {
      subscribe(): Subscription;
    };
  };
  removeChannel(sub: Subscription): void;
}

let mock: MockClient | null = null;
export function getMockClient(): MockClient {
  if (mock) return mock;
  mock = {
    auth: {
      async getSession() {
        await ensureReady();
        return { data: { session: currentSession() } };
      },
      onAuthStateChange(cb: AuthCallback) {
        authSubs.add(cb);
        void ensureReady().then(() => cb('INITIAL_SESSION', currentSession()));
        return { data: { subscription: { unsubscribe() { authSubs.delete(cb); } } } };
      },
      async signInWithOtp({ email }) {
        await ensureReady();
        // In demo: any email signs you in as whoever owns it, else the manager.
        const profile = state.profiles.find((p) => p.email === email) ?? state.profiles.find((p) => p.role === 'manager');
        if (profile) await setActiveUser(profile.id);
        return { error: null };
      },
      async signOut() {
        activeUserId = '';
        const conn = await db();
        await conn.put('meta', '', 'activeUserId');
        emitAuth('SIGNED_OUT');
      },
    },
    from(table: Table) { return new Query(table); },
    storage: {
      from(_bucket) {
        return {
          async upload(path, blob) {
            await ensureReady();
            blobs.set(path, blob);
            const conn = await db();
            await conn.put('blobs', blob, path);
            return { error: null };
          },
        };
      },
    },
    channel(_name) {
      return {
        on(_event, filter: any, cb) {
          const sub: Subscription = {
            table: filter.table as Table,
            event: filter.event ?? '*',
            filter: parseFilterString(filter.filter),
            cb,
          };
          return {
            subscribe() { subscriptions.add(sub); return sub; },
          };
        },
      };
    },
    removeChannel(sub) { subscriptions.delete(sub); },
  };
  return mock;
}

function parseFilterString(s: string | undefined): Subscription['filter'] {
  if (!s) return undefined;
  // Format: `user_id=eq.${uid}`
  const m = /^(\w+)=eq\.(.+)$/.exec(s);
  if (!m) return undefined;
  return { col: m[1], val: m[2] };
}

// ---------------------------------------------------------------------------
// Demo helpers exposed on window for the role switcher & Settings reset
// ---------------------------------------------------------------------------

async function setActiveUser(userId: string): Promise<void> {
  activeUserId = userId;
  const conn = await db();
  await conn.put('meta', userId, 'activeUserId');
  emitAuth('SIGNED_IN');
}

async function resetDemo(): Promise<void> {
  const conn = await db();
  for (const t of TABLES) await conn.clear(t);
  await conn.clear('meta');
  await conn.clear('blobs');
  blobs.clear();
  for (const t of TABLES) state[t] = [];
  await seedDemo();
}

declare global {
  interface Window {
    __demo?: {
      setActiveUser(userId: string): Promise<void>;
      reset(): Promise<void>;
      listProfiles(): Row[];
    };
  }
}
if (typeof window !== 'undefined') {
  window.__demo = {
    setActiveUser,
    reset: resetDemo,
    listProfiles: () => state.profiles,
  };
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function seedDemo(): Promise<void> {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const day = (offset: number, hour = 9, min = 0) => {
    const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(hour, min, 0, 0); return iso(d);
  };

  state.profiles = [
    { id: 'u-mgr', role: 'manager', full_name: 'Faisal (Manager)', email: 'faisal@demo.com', phone: null, client_id: null, active: true },
    { id: 'u-wa', role: 'worker',  full_name: 'Ahmed',            email: 'ahmed@demo.com',   phone: null, client_id: null, active: true },
    { id: 'u-wb', role: 'worker',  full_name: 'Sara',             email: 'sara@demo.com',    phone: null, client_id: null, active: true },
    { id: 'u-cli', role: 'client', full_name: 'Khaled Al-Saud',   email: 'khaled@demo.com',  phone: null, client_id: 'c-1', active: true },
  ];

  state.clients = [
    { id: 'c-1', name: 'Khaled Residence',  email: 'khaled@demo.com', phone: '+966 50 111 2222', address: 'Al Olaya, Riyadh', notes: null, created_by: 'u-mgr', created_at: day(-30, 9), updated_at: day(-30, 9) },
    { id: 'c-2', name: 'Al Manar Tower',    email: null,              phone: '+966 11 444 5555', address: 'King Fahd Rd',     notes: null, created_by: 'u-mgr', created_at: day(-25, 9), updated_at: day(-25, 9) },
    { id: 'c-3', name: 'Green Oasis Villa', email: null,              phone: '+966 55 333 7777', address: 'Diriyah',          notes: null, created_by: 'u-mgr', created_at: day(-20, 9), updated_at: day(-20, 9) },
  ];

  state.templates = [
    { id: 't-ac', title: { en: 'AC Maintenance', ar: 'صيانة المكيف' }, tasks: [
      { id: crypto.randomUUID(), order: 0, required: true,  label: { en: 'Inspect outdoor unit', ar: 'فحص الوحدة الخارجية' } },
      { id: crypto.randomUUID(), order: 1, required: true,  label: { en: 'Clean filters',        ar: 'تنظيف الفلاتر' } },
      { id: crypto.randomUUID(), order: 2, required: false, label: { en: 'Check gas pressure',    ar: 'فحص ضغط الغاز' } },
    ], version: 1, created_by: 'u-mgr', created_at: day(-30, 9), updated_at: day(-30, 9) },
  ];

  state.tasks = [
    mkTask('k-1', 'AC maintenance — Living room', 'u-wa', 'c-1', day(0, 9),  'not_started'),
    mkTask('k-2', 'Quarterly inspection',          'u-wa', 'c-2', day(0, 11), 'in_progress', { started_at: day(0, 10, 0) }),
    mkTask('k-3', 'Pool service',                  'u-wb', 'c-3', day(0, 14), 'not_started'),
    mkTask('k-4', 'Filter change',                 'u-wa', 'c-2', day(-1, 10),'submitted',   { started_at: day(-1, 10, 5), finished_at: day(-1, 10, 55) }),
    mkTask('k-5', 'Tile sealing',                  'u-wb', 'c-1', day(-1, 15),'approved',    { started_at: day(-1, 15, 5), finished_at: day(-1, 16, 30), decision_at: day(-1, 17), decision_note: '' }),
    mkTask('k-6', 'Leak inspection',               'u-wa', 'c-3', day(-2, 13),'rejected',    { started_at: day(-2, 13, 10), finished_at: day(-2, 14, 0), decision_at: day(-2, 15), decision_note: 'Photos unclear — please re-shoot.' }),
    mkTask('k-7', 'Follow-up AC',                  'u-wb', 'c-1', day(1, 9),  'not_started'),
    mkTask('k-8', 'Quote walk-through',            'u-wa', 'c-3', day(1, 13), 'not_started'),
  ];

  state.client_notes = [
    { id: 'n-1', client_id: 'c-1', body: 'Replace return-air filter on next visit.',         status: 'open',     created_in_task_id: 'k-5', resolved_in_task_id: null, created_by: 'u-wb', created_at: day(-1, 16), resolved_at: null },
    { id: 'n-2', client_id: 'c-3', body: 'Customer requested earlier slot — try 8am next time.', status: 'open', created_in_task_id: 'k-6', resolved_in_task_id: null, created_by: 'u-wa', created_at: day(-2, 14), resolved_at: null },
    { id: 'n-3', client_id: 'c-2', body: 'Gate code: 4242. Key under the side planter.',     status: 'resolved', created_in_task_id: 'k-4', resolved_in_task_id: 'k-4', created_by: 'u-wa', created_at: day(-1, 10, 30), resolved_at: day(-1, 11) },
  ];

  // Pre-seeded notifications (recent inbox state).
  state.notifications = [
    { id: 'no-1', user_id: 'u-mgr', kind: 'task.submitted', payload: { task_id: 'k-4', title: 'Filter change', worker_id: 'u-wa' }, read_at: null, email_sent_at: null, created_at: day(-1, 11) },
    { id: 'no-2', user_id: 'u-wa',  kind: 'task.assigned',  payload: { task_id: 'k-1', title: 'AC maintenance — Living room', scheduled_at: day(0, 9) }, read_at: day(-1, 8), email_sent_at: null, created_at: day(-1, 7) },
    { id: 'no-3', user_id: 'u-wa',  kind: 'task.rejected',  payload: { task_id: 'k-6', title: 'Leak inspection' }, read_at: null, email_sent_at: null, created_at: day(-2, 15, 5) },
    { id: 'no-4', user_id: 'u-wb',  kind: 'task.assigned',  payload: { task_id: 'k-3', title: 'Pool service', scheduled_at: day(0, 14) }, read_at: null, email_sent_at: null, created_at: day(-1, 7, 30) },
  ];

  state.audit_log = [
    { id: 'a-1', actor_id: 'u-mgr', action: 'task.created',  entity: 'task', entity_id: 'k-1', payload: { status: 'not_started' }, at: day(-1, 7) },
    { id: 'a-2', actor_id: 'u-wa',  action: 'task.submitted',entity: 'task', entity_id: 'k-4', payload: { status: 'submitted' },  at: day(-1, 11) },
    { id: 'a-3', actor_id: 'u-mgr', action: 'task.approved', entity: 'task', entity_id: 'k-5', payload: { status: 'approved' },   at: day(-1, 17) },
    { id: 'a-4', actor_id: 'u-mgr', action: 'task.rejected', entity: 'task', entity_id: 'k-6', payload: { status: 'rejected' },   at: day(-2, 15) },
  ];

  for (const t of TABLES) await persist(t);
  const conn = await db();
  await conn.put('meta', '1', 'seeded');
  await conn.put('meta', activeUserId, 'activeUserId');
}

function mkTask(
  id: string, title: string, workerId: string, clientId: string, when: string,
  status: 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected',
  extra: Partial<Row> = {},
): Row {
  return {
    id, title, description: null, template_id: null,
    client_id: clientId, assigned_worker_id: workerId,
    scheduled_at: when, scheduled_end: null,
    status, created_by: 'u-mgr',
    created_at: when, updated_at: when,
    started_at: null, finished_at: null,
    decision_at: null, decision_note: null,
    results: [], signature: null,
    ...extra,
  };
}

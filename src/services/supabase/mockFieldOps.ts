/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Demo-mode mirror of supabase/migrations/0006_field_ops.sql triggers.
 *
 * The rules come from the same domain functions the UI uses, so the demo
 * rejects exactly what Postgres rejects (BR-001/002/009/010/014, state
 * machines, recurring roll-forward). RLS is not emulated.
 */
import { checkAllocation, isMonthClosed } from '@/domain/labor/allocation';
import { canCorrectCompleted, canMoveProject, canMoveTask, canMoveVisit, nextDueDate } from '@/domain/fieldops/fieldOps';
import type { LaborAllocation } from '@/domain/models/ops';

export const FIELD_OPS_TABLES = [
  'project_types',
  'project_stages',
  'projects',
  'employees',
  'visits',
  'project_tasks',
  'project_recurring_items',
  'task_photos',
  'month_closes',
  'labor_allocations',
  'visit_reports',
] as const;

interface Row { id: string; [k: string]: any }
type State = Record<string, Row[]>;
type Op = 'INSERT' | 'UPDATE' | 'DELETE';

export interface GuardContext {
  state: State;
  actorId: string;
  audit(action: string, entity: string, entityId: string | null, payload: Record<string, unknown>): void;
}

class RuleError extends Error {}

function fail(msg: string): never {
  throw new RuleError(msg);
}

function toAllocation(r: Row): LaborAllocation & { changeReason?: string } {
  return {
    id: r.id,
    workDate: String(r.work_date).slice(0, 10),
    employeeId: r.employee_id,
    projectId: r.project_id,
    visitId: r.visit_id ?? undefined,
    duration: Number(r.duration) as LaborAllocation['duration'],
    supervisorId: r.supervisor_id,
    changeReason: r.change_reason ?? undefined,
    voidedAt: r.voided_at ?? undefined,
    voidReason: r.void_reason ?? undefined,
  };
}

function actorIsManager(ctx: GuardContext): boolean {
  const p = ctx.state.profiles.find((x) => x.id === ctx.actorId);
  return !!p && p.active && p.role === 'manager';
}

function actorHasFinance(ctx: GuardContext): boolean {
  const p = ctx.state.profiles.find((x) => x.id === ctx.actorId);
  return !!p && p.active && (p.role === 'finance' || p.finance_access === true);
}

const NO_DELETE = new Set(['projects', 'employees', 'labor_allocations', 'month_closes', 'visit_reports']);

/** Fills column defaults the SQL schema would. */
export function fieldOpsDefaults(table: string, row: Row, actorId: string, state: State): Row {
  const now = new Date().toISOString();
  const r = { ...row };
  switch (table) {
    case 'projects':
      r.status ??= 'active';
      break;
    case 'employees':
      r.status ??= 'active';
      break;
    case 'visits':
      r.status ??= 'planned';
      r.visit_date ??= now.slice(0, 10);
      break;
    case 'project_tasks':
      r.status ??= 'open';
      r.source ??= 'manual';
      r.photo_required ??= false;
      r.required ??= true;
      break;
    case 'project_recurring_items':
      r.active ??= true;
      r.photo_required ??= false;
      break;
    case 'task_photos':
      r.uploaded_at ??= now;
      r.uploaded_by ??= actorId;
      return r;
    case 'month_closes':
      r.id ??= r.month;                 // IDB needs an id; Postgres keys on month
      r.closed_at ??= now;
      r.closed_by ??= actorId;
      return r;
    case 'visit_reports': {
      r.report_number ??= state.visit_reports.reduce((max, x) => Math.max(max, Number(x.report_number) || 0), 0) + 1;
      r.signature_status ??= 'unsigned';
      r.generated_at ??= now;
      r.created_by ??= actorId;
      return r;
    }
    case 'project_types':
    case 'project_stages':
      r.active ??= true;
      r.created_at ??= now;
      return r;
  }
  r.created_at ??= now;
  r.updated_at ??= now;
  r.created_by ??= actorId;
  return r;
}

/**
 * Runs the BEFORE-trigger logic. May adjust `next` in place (timestamps).
 * Throws with the same rule code as Postgres when the write is refused.
 */
export function fieldOpsBefore(table: string, op: Op, prev: Row | null, next: Row | null, ctx: GuardContext): void {
  if (op === 'DELETE' && NO_DELETE.has(table)) {
    fail(`BR-014: ${table} rows cannot be deleted; archive, close or void instead`);
  }
  if (op === 'UPDATE' && table === 'month_closes') {
    fail('BR-014: month_closes rows cannot be changed');
  }

  switch (table) {
    case 'visits': {
      if (op === 'DELETE') {
        const hasLabor = ctx.state.labor_allocations.some((a) => a.visit_id === prev!.id);
        if (prev!.status !== 'planned' || hasLabor) fail('BR-014: only a planned visit with no labor can be deleted');
        return;
      }
      if (op === 'UPDATE' && prev!.status !== next!.status) {
        if (!canMoveVisit(prev!.status, next!.status)) fail(`Visit cannot move from ${prev!.status} to ${next!.status}`);
        const now = new Date().toISOString();
        if (next!.status === 'in_progress') next!.started_at ??= now;
        if (next!.status === 'completed') next!.completed_at ??= now;
      }
      // 0007 visits_supervisor_guard (runs after trg_visits_guard, as in Postgres)
      if (op === 'UPDATE' && !actorIsManager(ctx)) {
        if (prev!.status === 'completed') fail('A completed visit cannot be changed');
        if (next!.supervisor_id !== prev!.supervisor_id && next!.supervisor_id !== ctx.actorId) {
          fail('A supervisor can only assign a visit to themselves');
        }
        if (String(next!.visit_date) !== String(prev!.visit_date) && prev!.status !== 'planned') {
          fail('The date of a started visit cannot be changed');
        }
      }
      return;
    }
    case 'project_tasks': {
      if (op === 'DELETE') {
        if (prev!.status === 'completed') fail('BR-014: a completed task cannot be deleted');
        if (ctx.state.task_photos.some((ph) => ph.task_id === prev!.id)) {
          fail('update or delete on table "project_tasks" violates foreign key constraint "task_photos_task_id_fkey"');
        }
        return;
      }
      if (op === 'INSERT') {
        // 0007 project_tasks_insert_guard
        if (!actorIsManager(ctx)) {
          next!.status = 'open';
          next!.completed_at = null;
          next!.completed_in_visit_id = null;
        }
        next!.was_follow_up = next!.status === 'needs_follow_up';
        return;
      }
      if (op === 'UPDATE' && prev!.status !== next!.status) {
        if (prev!.status === 'completed') {
          const visit = ctx.state.visits.find((v) => v.id === prev!.completed_in_visit_id);
          if (!canCorrectCompleted({ status: 'completed', completedInVisitId: prev!.completed_in_visit_id ?? undefined }, visit?.status)) {
            fail('A completed task cannot be reopened');
          }
          next!.completed_at = null;
          next!.completed_in_visit_id = null;
          if (next!.status === 'open' && prev!.was_follow_up) next!.status = 'needs_follow_up';
          return;
        }
        if (!canMoveTask(prev!.status, next!.status)) fail('A follow-up task cannot go back to open');
        if (next!.status === 'completed') next!.completed_at ??= new Date().toISOString();
        if (next!.status === 'needs_follow_up') next!.was_follow_up = true;
      }
      return;
    }
    case 'visit_reports': {
      // 0007 visit_reports_guard: issued content is frozen for non-managers.
      if (op === 'UPDATE' && prev!.content && JSON.stringify(next!.content) !== JSON.stringify(prev!.content) && !actorIsManager(ctx)) {
        fail('An issued report cannot be rewritten');
      }
      return;
    }
    case 'projects': {
      if (op === 'UPDATE' && prev!.status !== next!.status) {
        if (!canMoveProject(prev!.status, next!.status)) fail(`Project is ${prev!.status} and cannot change status`);
        if (next!.status === 'completed' || next!.status === 'closed') {
          const open = ctx.state.project_tasks.some((t) => t.project_id === next!.id && t.status !== 'completed');
          if (open) fail('Project has open or follow-up tasks and cannot be closed');
          next!.closed_at ??= new Date().toISOString();
        }
      }
      return;
    }
    case 'labor_allocations': {
      if (op === 'DELETE') return;
      const cand = toAllocation(next!);
      if (Number(next!.duration) !== 0.5 && Number(next!.duration) !== 1) {
        fail('new row violates check constraint "duration_full_or_half"');
      }
      if (next!.voided_at && !next!.void_reason) fail('new row violates check constraint "void_needs_reason"');
      const others = ctx.state.labor_allocations.map(toAllocation);
      const closes = ctx.state.month_closes.map((m) => ({ month: String(m.month) }));
      const err = checkAllocation(cand, others, closes, { hasFinance: actorHasFinance(ctx) }, prev ? toAllocation(prev) : undefined);
      if (err) {
        switch (err.code) {
          case 'BR-009': fail('BR-009: labor for this month is closed');
          case 'BR-010': fail('BR-010: a reason is required to change labor after month close');
          case 'BR-001': fail(`BR-001: employee already has ${err.existing} day(s) on ${err.workDate}; adding ${err.requested} would exceed 1.0`);
          case 'DUPLICATE_IN_VISIT': fail('duplicate key value violates unique constraint "labor_one_per_visit"');
          case 'BR-002': fail('new row violates check constraint "duration_full_or_half"');
        }
      }
      if (op === 'UPDATE' && next!.voided_at && !prev!.voided_at) next!.voided_by = ctx.actorId;
      return;
    }
    case 'month_closes': {
      if (op === 'INSERT' && !actorHasFinance(ctx)) fail('new row violates row-level security policy for table "month_closes"');
      if (op === 'INSERT' && isMonthClosed(String(next!.month), ctx.state.month_closes.map((m) => ({ month: String(m.month) })))) {
        fail('duplicate key value violates unique constraint "month_closes_pkey"');
      }
      return;
    }
  }
}

const AUDITED = new Set(['projects', 'employees', 'visits', 'project_tasks', 'labor_allocations', 'month_closes']);

/** AFTER-trigger logic: audit old/new and roll recurring items. */
export function fieldOpsAfter(table: string, op: Op, prev: Row | null, next: Row | null, ctx: GuardContext): void {
  if (AUDITED.has(table)) {
    const id = (next ?? prev)!.id;
    ctx.audit(`${table}.${op.toLowerCase()}`, table, table === 'month_closes' ? null : id, {
      old: op === 'INSERT' ? null : prev,
      new: op === 'DELETE' ? null : next,
    });
  }
  const roll = (itemId: string, completedAt: string | null) => {
    const item = ctx.state.project_recurring_items.find((r) => r.id === itemId);
    if (!item) return;
    const done = String(completedAt ?? new Date().toISOString()).slice(0, 10);
    item.last_done_on = done;
    item.next_due_on = nextDueDate(done, item.recurrence);
    item.updated_at = new Date().toISOString();
  };
  // Completed outside a visit: roll at once. During a visit: when it completes.
  if (table === 'project_tasks' && op === 'UPDATE' && next!.recurring_item_id && !next!.completed_in_visit_id
      && next!.status === 'completed' && prev!.status !== 'completed') {
    roll(next!.recurring_item_id, next!.completed_at);
  }
  if (table === 'visits' && op === 'UPDATE' && next!.status === 'completed' && prev!.status !== 'completed') {
    for (const t of ctx.state.project_tasks) {
      if (t.completed_in_visit_id === next!.id && t.status === 'completed' && t.recurring_item_id) {
        roll(t.recurring_item_id, t.completed_at);
      }
    }
  }
}

export function isFieldOpsTable(t: string): boolean {
  return (FIELD_OPS_TABLES as readonly string[]).includes(t);
}

// ---------------------------------------------------------------------------
// Seed (mirrors the config rows inserted by 0006, plus demo projects/crew)
// ---------------------------------------------------------------------------

export function seedFieldOps(state: State, day: (offset: number, hour?: number, min?: number) => string): void {
  const date = (offset: number) => day(offset).slice(0, 10);

  // Checklist templates scoped to a project type or stage (mirrors 0006's seed,
  // with a few frequencies set so the demo shows periodic items).
  const item = (id: string, order: number, en: string, ar: string, extra: Partial<Row> = {}, ur?: string) =>
    ({ id, order, required: false, label: ur ? { en, ar, ur } : { en, ar }, ...extra });
  state.templates.push(
    { id: 't-mnt', title: { en: 'Maintenance — standard', ar: 'صيانة — القائمة الأساسية' }, project_type_id: 'pt-mnt', stage_id: null, active: true, version: 1,
      created_by: 'u-mgr', created_at: day(-90), updated_at: day(-90), tasks: [
        item('m-irr',   0, 'Irrigation network check', 'فحص شبكة الري', { recurrence: 'weekly' }, 'آبپاشی کے نظام کا معائنہ'),
        item('m-plant', 1, 'Plant and general condition check', 'فحص النباتات والحالة العامة', { required: true }, 'پودوں اور عمومی حالت کا معائنہ'),
        item('m-prune', 2, 'Pruning', 'التقليم', {}, 'کٹائی'),
        item('m-fert',  3, 'Fertilizing', 'التسميد', { recurrence: 'monthly' }, 'کھاد ڈالنا'),
        item('m-spray', 4, 'Spraying / pest control', 'الرش / المكافحة', { recurrence: 'monthly' }, 'اسپرے / کیڑوں کا تدارک'),
        item('m-weed',  5, 'Weeding', 'إزالة الحشائش', {}, 'جڑی بوٹیوں کی صفائی'),
        item('m-clean', 6, 'Cleaning', 'النظافة', { required: true, photoRequired: true }, 'صفائی'),
        item('m-pump',  7, 'Pumps / site equipment check', 'فحص المضخات أو المعدات المرتبطة بالموقع', {}, 'پمپ / سائٹ کے آلات کا معائنہ'),
      ] },
    { id: 't-irr', title: { en: 'Irrigation network — stage checklist', ar: 'شبكة الري — قائمة المرحلة' }, project_type_id: 'pt-est', stage_id: 'st-irrigation', active: true, version: 1,
      created_by: 'u-mgr', created_at: day(-90), updated_at: day(-90), tasks: [
        item('i-test',  0, 'Pressure-test irrigation lines', 'اختبار ضغط خطوط الري', { required: true, photoRequired: true }, 'آبپاشی کی لائنوں کا پریشر ٹیسٹ'),
        item('i-drip',  1, 'Check drip emitters at each basin', 'فحص النقاطات عند كل حوض', { required: true }, 'ہر حوض پر ڈرپ ایمیٹرز کا معائنہ'),
        item('i-notes', 2, 'Record defects and fixes needed', 'تسجيل الملاحظات والمعالجات المطلوبة', { required: true }, 'خرابیاں اور ضروری مرمت درج کریں'),
      ] },
  );

  state.project_types = [
    { id: 'pt-est', code: 'establishment', name: { en: 'Establishment / Execution', ar: 'تأسيس / تنفيذ', ur: 'قیام / تعمیر' }, uses_stages: true,  sort_order: 1, active: true },
    { id: 'pt-mnt', code: 'maintenance',   name: { en: 'Maintenance', ar: 'صيانة', ur: 'دیکھ بھال' },                         uses_stages: false, sort_order: 2, active: true },
    { id: 'pt-mod', code: 'modification',  name: { en: 'Modification / Addition', ar: 'تعديل / إضافة', ur: 'ترمیم / اضافہ' },     uses_stages: false, sort_order: 3, active: true },
    { id: 'pt-oth', code: 'other',         name: { en: 'Other', ar: 'أخرى', ur: 'دیگر' },                                uses_stages: false, sort_order: 4, active: true },
  ];

  const stages: [string, string, string, string][] = [
    ['site_handover', 'Site handover & preparation', 'استلام وتجهيز الموقع', 'سائٹ کی وصولی اور تیاری'],
    ['preparatory', 'Preparatory works', 'الأعمال التحضيرية', 'تیاری کے کام'],
    ['irrigation', 'Irrigation network', 'شبكة الري', 'آبپاشی کا نظام'],
    ['planting_ready', 'Planting readiness', 'جاهزية الزراعة', 'شجرکاری کی تیاری'],
    ['planting', 'Planting / Execution', 'الزراعة / التنفيذ', 'شجرکاری / تعمیر'],
    ['handover', 'Inspection & handover', 'الفحص والتسليم', 'معائنہ اور حوالگی'],
  ];
  state.project_stages = stages.map(([code, en, ar, ur], i) => ({
    id: `st-${code}`, project_type_id: 'pt-est', code, name: { en, ar, ur }, sort_order: i + 1, active: true,
  }));

  state.projects = [
    { id: 'pr-1', code: 'MNT-001', name: 'Khaled Residence — garden', client_id: 'c-1', project_type_id: 'pt-mnt', stage_id: null, status: 'active',  supervisor_id: 'u-wa', notes: null, closed_at: null, created_by: 'u-mgr', created_at: day(-60), updated_at: day(-60), updated_by: null },
    { id: 'pr-2', code: 'EST-001', name: 'Green Oasis Villa — landscaping', client_id: 'c-3', project_type_id: 'pt-est', stage_id: 'st-irrigation', status: 'active', supervisor_id: 'u-wb', notes: null, closed_at: null, created_by: 'u-mgr', created_at: day(-40), updated_at: day(-40), updated_by: null },
    { id: 'pr-3', code: 'MOD-001', name: 'Al Manar Tower — lobby planters', client_id: 'c-2', project_type_id: 'pt-mod', stage_id: null, status: 'completed', supervisor_id: 'u-wa', notes: null, closed_at: day(-10), created_by: 'u-mgr', created_at: day(-50), updated_at: day(-10), updated_by: null },
  ];

  const crew = ['Mohammed Rafiq', 'Abdul Karim', 'Imran Khan', 'Suresh Kumar', 'Bilal Ahmed', 'Nasir Hussain'];
  state.employees = crew.map((full_name, i) => ({
    id: `em-${i + 1}`, code: `W-${String(i + 1).padStart(3, '0')}`, full_name, phone: null,
    status: 'active', notes: null, created_by: 'u-mgr', created_at: day(-90), updated_at: day(-90), updated_by: null,
  }));
  state.employees.push({
    id: 'em-7', code: 'W-007', full_name: 'Tariq Mahmood', phone: null, status: 'inactive', notes: null,
    created_by: 'u-mgr', created_at: day(-90), updated_at: day(-20), updated_by: 'u-mgr',
  });

  state.visits = [
    { id: 'vi-1', project_id: 'pr-1', visit_date: date(-1), supervisor_id: 'u-wa', status: 'completed', started_at: day(-1, 8), completed_at: day(-1, 13), notes: null, created_by: 'u-wa', created_at: day(-1, 8), updated_at: day(-1, 13), updated_by: 'u-wa' },
    { id: 'vi-2', project_id: 'pr-2', visit_date: date(0),  supervisor_id: 'u-wb', status: 'in_progress', started_at: day(0, 7, 30), completed_at: null, notes: null, created_by: 'u-wb', created_at: day(0, 7, 30), updated_at: day(0, 7, 30), updated_by: 'u-wb' },
  ];

  const t = (id: string, project_id: string, description: string, status: string, extra: Partial<Row> = {}): Row => ({
    id, project_id, visit_id: null, source: 'manual', template_id: null, template_item_id: null, recurring_item_id: null,
    description, status, photo_required: false, required: true, note: null, completed_at: null, completed_in_visit_id: null,
    last_visit_id: null, created_by: 'u-mgr', created_at: day(-2), updated_at: day(-2), updated_by: null,
    was_follow_up: status === 'needs_follow_up', ...extra,
  });
  state.project_tasks = [
    t('pt-1', 'pr-1', 'Fertilizing', 'needs_follow_up', { visit_id: 'vi-1', last_visit_id: 'vi-1', note: 'Fertilizer not delivered yet' }),
    t('pt-2', 'pr-1', 'Pruning', 'completed', { visit_id: 'vi-1', completed_at: day(-1, 11), completed_in_visit_id: 'vi-1' }),
    t('pt-3', 'pr-1', 'Irrigation network check', 'open', { source: 'recurring', recurring_item_id: 'ri-1', template_id: 't-mnt', template_item_id: 'm-irr' }),
    t('pt-4', 'pr-2', 'Pressure-test irrigation lines', 'open', { source: 'stage', visit_id: 'vi-2', photo_required: true, template_id: 't-irr', template_item_id: 'i-test' }),
    t('pt-5', 'pr-2', 'Check drip emitters at each basin', 'open', { source: 'stage', visit_id: 'vi-2', template_id: 't-irr', template_item_id: 'i-drip' }),
    t('pt-6', 'pr-2', 'Record defects and fixes needed', 'open', { source: 'stage', visit_id: 'vi-2', template_id: 't-irr', template_item_id: 'i-notes' }),
  ];

  state.project_recurring_items = [
    { id: 'ri-1', project_id: 'pr-1', template_id: 't-mnt', template_item_id: 'm-irr', description: 'Irrigation network check', recurrence: 'weekly',  last_done_on: date(-8),  next_due_on: date(-1), photo_required: false, active: true, created_by: 'u-mgr', created_at: day(-60), updated_at: day(-8), updated_by: null },
    { id: 'ri-2', project_id: 'pr-1', template_id: 't-mnt', template_item_id: 'm-spray', description: 'Spraying / pest control',  recurrence: 'monthly', last_done_on: date(-12), next_due_on: nextDueDate(date(-12), 'monthly'), photo_required: false, active: true, created_by: 'u-mgr', created_at: day(-60), updated_at: day(-12), updated_by: null },
    { id: 'ri-3', project_id: 'pr-1', template_id: 't-mnt', template_item_id: 'm-fert', description: 'Fertilizing', recurrence: 'monthly', last_done_on: date(-10), next_due_on: nextDueDate(date(-10), 'monthly'), photo_required: false, active: true, created_by: 'u-mgr', created_at: day(-60), updated_at: day(-40), updated_by: null },
  ];

  state.task_photos = [];
  state.month_closes = [];

  const la = (id: string, offset: number, employee_id: string, project_id: string, visit_id: string | null, duration: number, supervisor_id: string): Row => ({
    id, work_date: date(offset), employee_id, project_id, visit_id, duration, supervisor_id, notes: null,
    change_reason: null, voided_at: null, voided_by: null, void_reason: null,
    created_by: supervisor_id, created_at: day(offset, 8), updated_at: day(offset, 8), updated_by: null,
  });
  state.labor_allocations = [
    la('la-1', -1, 'em-1', 'pr-1', 'vi-1', 1,   'u-wa'),
    la('la-2', -1, 'em-2', 'pr-1', 'vi-1', 1,   'u-wa'),
    la('la-3', -1, 'em-3', 'pr-1', 'vi-1', 0.5, 'u-wa'),
    la('la-4', 0,  'em-3', 'pr-2', 'vi-2', 1,   'u-wb'),
    la('la-5', 0,  'em-4', 'pr-2', 'vi-2', 0.5, 'u-wb'),
  ];

  state.visit_reports = [
    { id: 'vr-1', visit_id: 'vi-1', report_number: 1, signature_status: 'unsigned', signer_name: null, signature: null, signed_at: null, content: null, generated_at: day(-1, 13), created_by: 'u-wa' },
  ];
}

export { RuleError };

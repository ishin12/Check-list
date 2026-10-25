import { getSupabase } from '@/services/supabase/client';
import type { ExtraWorkEntry, FieldTask } from '@/domain/models/ops';
import type { TaskLocation } from '@/domain/location';
import { nextOccurrenceDate, type Recurrence } from '@/domain/job/recurrence';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  template_id: string | null;
  client_id: string;
  assigned_worker_id: string;
  scheduled_at: string;
  scheduled_end: string | null;
  status: FieldTask['status'];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  decision_at: string | null;
  decision_note: string | null;
  results: FieldTask['results'];
  signature: FieldTask['signature'];
  recurrence: Recurrence | null;
  series_id: string | null;
  extra_work: ExtraWorkEntry[] | null;
  approval_method: FieldTask['approvalMethod'] | null;
  location_url?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  /** Embedded task_workers(worker_id); absent on rows from inserts. */
  task_workers?: Array<{ worker_id: string }> | null;
}

/** Lead first, then the other workers; always includes the lead. */
function workerIdsOf(r: TaskRow): string[] {
  const ids = [r.assigned_worker_id];
  for (const w of r.task_workers ?? []) if (!ids.includes(w.worker_id)) ids.push(w.worker_id);
  return ids;
}

const TASK_SELECT = '*, task_workers(worker_id)';

function rowToTask(r: TaskRow): FieldTask {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    templateId: r.template_id ?? undefined,
    clientId: r.client_id,
    assignedWorkerId: r.assigned_worker_id,
    workerIds: workerIdsOf(r),
    scheduledAt: r.scheduled_at,
    scheduledEnd: r.scheduled_end ?? undefined,
    status: r.status,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    decisionAt: r.decision_at ?? undefined,
    decisionNote: r.decision_note ?? undefined,
    results: r.results ?? [],
    signature: r.signature ?? undefined,
    recurrence: r.recurrence ?? 'none',
    seriesId: r.series_id ?? undefined,
    extraWork: r.extra_work ?? [],
    approvalMethod: r.approval_method ?? undefined,
    locationUrl: r.location_url ?? undefined,
    locationLat: r.location_lat ?? undefined,
    locationLng: r.location_lng ?? undefined,
  };
}

export async function listTasks(opts: {
  workerId?: string;
  clientId?: string;
  from?: string;
  to?: string;
  status?: FieldTask['status'];
  seriesId?: string;
} = {}): Promise<FieldTask[]> {
  const sb = getSupabase();
  let q = sb.from('tasks').select(TASK_SELECT).order('scheduled_at', { ascending: true });
  if (opts.workerId) {
    // Every task the worker is on (not just as lead). Done in two steps so the
    // embedded task_workers list on each task stays complete.
    const { data: mine, error: mineErr } = await sb
      .from('task_workers').select('task_id').eq('worker_id', opts.workerId);
    if (mineErr) throw mineErr;
    const ids = ((mine ?? []) as Array<{ task_id: string }>).map((r) => r.task_id);
    if (ids.length === 0) return [];
    q = q.in('id', ids);
  }
  if (opts.clientId)  q = q.eq('client_id', opts.clientId);
  if (opts.status)    q = q.eq('status', opts.status);
  if (opts.seriesId)  q = q.eq('series_id', opts.seriesId);
  if (opts.from)      q = q.gte('scheduled_at', opts.from);
  if (opts.to)        q = q.lte('scheduled_at', opts.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data as TaskRow[]).map(rowToTask);
}

export async function getTask(id: string): Promise<FieldTask | null> {
  const { data, error } = await getSupabase()
    .from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToTask(data as TaskRow) : null;
}

export async function updateTaskStatus(
  id: string,
  patch: Partial<Pick<TaskRow, 'status' | 'started_at' | 'finished_at' | 'decision_at' | 'decision_note' | 'approval_method'>>,
): Promise<void> {
  const { error } = await getSupabase().from('tasks').update(patch).eq('id', id);
  if (error) throw error;
}

export interface SigningLinkRow {
  id: string;
  task_id: string;
  token: string;
  expires_at: string;
  signed_at: string | null;
  auto_approved_at: string | null;
  whatsapp_status: 'queued' | 'sent' | 'failed';
  whatsapp_error: unknown;
}

/** Latest signing link for a task, if any. */
export async function getSigningLink(taskId: string): Promise<SigningLinkRow | null> {
  const { data } = await getSupabase()
    .from('signing_links').select('*').eq('task_id', taskId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as SigningLinkRow) ?? null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  clientId: string;
  /** One or more workers; the first is the lead. */
  workerIds: string[];
  scheduledAt: string;
  scheduledEnd?: string;
  templateId?: string;
  recurrence?: Recurrence;
  location?: TaskLocation | null;
}

function locationColumns(loc?: TaskLocation | null) {
  return {
    location_url: loc?.locationUrl ?? null,
    location_lat: loc?.locationLat ?? null,
    location_lng: loc?.locationLng ?? null,
  };
}

/** Set or clear (null) the Google Maps location of a task. Manager only in the UI. */
export async function updateTaskLocation(taskId: string, loc: TaskLocation | null): Promise<void> {
  const { error } = await getSupabase().from('tasks').update(locationColumns(loc)).eq('id', taskId);
  if (error) throw error;
}

export async function createTask(input: CreateTaskInput): Promise<FieldTask> {
  if (input.workerIds.length === 0) throw new Error('At least one worker is required');
  const recurrence: Recurrence = input.recurrence ?? 'none';
  const seriesId = crypto.randomUUID();
  const { data, error } = await getSupabase()
    .from('tasks')
    .insert({
      title: input.title,
      description: input.description ?? null,
      client_id: input.clientId,
      assigned_worker_id: input.workerIds[0],
      scheduled_at: input.scheduledAt,
      scheduled_end: input.scheduledEnd ?? null,
      template_id: input.templateId ?? null,
      recurrence,
      series_id: seriesId,
      ...locationColumns(input.location),
    })
    .select('*').single();
  if (error) throw error;
  const created = rowToTask(data as TaskRow);
  return applyWorkers(created, input.workerIds);
}

/** Replace the full worker set of a task (manager only; atomic RPC). */
export async function setTaskWorkers(taskId: string, workerIds: string[]): Promise<void> {
  const { error } = await getSupabase().rpc('set_task_workers', {
    p_task: taskId, p_workers: workerIds,
  });
  if (error) throw error;
}

/** After insert the lead is already in place; add the rest only when needed. */
async function applyWorkers(task: FieldTask, workerIds: string[]): Promise<FieldTask> {
  if (workerIds.length <= 1) return { ...task, workerIds: [...workerIds] };
  await setTaskWorkers(task.id, workerIds);
  return { ...task, workerIds: [...workerIds] };
}

/** Delete all proofs of a given kind on a task, plus the underlying files. */
export async function deleteProofsOfKind(taskId: string, kind: 'start' | 'finish'): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.from('task_proofs').select('id, storage_path').eq('task_id', taskId).eq('kind', kind);
  const paths = ((data ?? []) as Array<{ id: string; storage_path: string }>).map((r) => r.storage_path);
  if (paths.length) {
    await sb.storage.from('proofs').remove(paths);
    await sb.from('task_proofs').delete().eq('task_id', taskId).eq('kind', kind);
  }
}

/** Records an already-uploaded proof file against a task. */
export async function insertProofRow(input: {
  taskId: string; kind: 'start' | 'finish'; path: string; mime: string; capturedAt: string;
}): Promise<void> {
  const { error } = await getSupabase().from('task_proofs').insert({
    task_id: input.taskId,
    kind: input.kind,
    storage_path: input.path,
    mime: input.mime,
    captured_at: input.capturedAt,
  });
  if (error) throw error;
}

/**
 * After a successful retake: remove the older proofs of this kind (rows and
 * files), keeping the one stored at `keepPath`. Called only once the new proof
 * is safely saved, so a failed upload never leaves the task without a proof.
 */
export async function deleteOtherProofsOfKind(taskId: string, kind: 'start' | 'finish', keepPath: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.from('task_proofs').select('id, storage_path').eq('task_id', taskId).eq('kind', kind);
  const old = ((data ?? []) as Array<{ id: string; storage_path: string }>).filter((r) => r.storage_path !== keepPath);
  if (!old.length) return;
  for (const r of old) await sb.from('task_proofs').delete().eq('id', r.id);
  await sb.storage.from('proofs').remove(old.map((r) => r.storage_path));
}

/**
 * Auto-creates the next occurrence in a recurring series. Returns the new
 * task, or null if the source task does not recur or the next visit is
 * already scheduled.
 */
export async function createNextOccurrence(task: FieldTask): Promise<FieldTask | null> {
  if (task.recurrence === 'none') return null;
  const nextAt = nextOccurrenceDate(task.scheduledAt, task.recurrence);
  if (!nextAt) return null;
  const seriesId = task.seriesId ?? task.id;

  // Avoid double-creating if there's already a future visit in this series.
  const existing = await listTasks({ seriesId, from: new Date(task.scheduledAt).toISOString() });
  if (existing.some((t) => t.id !== task.id && new Date(t.scheduledAt) > new Date(task.scheduledAt))) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from('tasks')
    .insert({
      title: task.title,
      description: task.description ?? null,
      client_id: task.clientId,
      assigned_worker_id: task.assignedWorkerId,
      scheduled_at: nextAt,
      scheduled_end: null,
      template_id: task.templateId ?? null,
      recurrence: task.recurrence,
      series_id: seriesId,
      ...locationColumns(task),
    })
    .select('*').single();
  if (error) throw error;
  // Copy the full worker list (the lead is already set by the insert).
  return applyWorkers(rowToTask(data as TaskRow), task.workerIds.length ? task.workerIds : [task.assignedWorkerId]);
}

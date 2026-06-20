import { getSupabase } from '@/services/supabase/client';
import type { ExtraWorkEntry, FieldTask } from '@/domain/models/ops';
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
}

function rowToTask(r: TaskRow): FieldTask {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    templateId: r.template_id ?? undefined,
    clientId: r.client_id,
    assignedWorkerId: r.assigned_worker_id,
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
  let q = getSupabase().from('tasks').select('*').order('scheduled_at', { ascending: true });
  if (opts.workerId)  q = q.eq('assigned_worker_id', opts.workerId);
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
    .from('tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToTask(data as TaskRow) : null;
}

export async function updateTaskStatus(
  id: string,
  patch: Partial<Pick<TaskRow, 'status' | 'started_at' | 'finished_at' | 'decision_at' | 'decision_note'>>,
): Promise<void> {
  const { error } = await getSupabase().from('tasks').update(patch).eq('id', id);
  if (error) throw error;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  clientId: string;
  assignedWorkerId: string;
  scheduledAt: string;
  scheduledEnd?: string;
  templateId?: string;
  recurrence?: Recurrence;
}

export async function createTask(input: CreateTaskInput): Promise<FieldTask> {
  const recurrence: Recurrence = input.recurrence ?? 'none';
  const seriesId = crypto.randomUUID();
  const { data, error } = await getSupabase()
    .from('tasks')
    .insert({
      title: input.title,
      description: input.description ?? null,
      client_id: input.clientId,
      assigned_worker_id: input.assignedWorkerId,
      scheduled_at: input.scheduledAt,
      scheduled_end: input.scheduledEnd ?? null,
      template_id: input.templateId ?? null,
      recurrence,
      series_id: seriesId,
    })
    .select('*').single();
  if (error) throw error;
  return rowToTask(data as TaskRow);
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
    })
    .select('*').single();
  if (error) throw error;
  return rowToTask(data as TaskRow);
}

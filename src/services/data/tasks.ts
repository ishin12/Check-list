import { getSupabase } from '@/services/supabase/client';
import type { FieldTask } from '@/domain/models/ops';

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
  };
}

export async function listTasks(opts: {
  workerId?: string;
  clientId?: string;
  from?: string;
  to?: string;
  status?: FieldTask['status'];
} = {}): Promise<FieldTask[]> {
  let q = getSupabase().from('tasks').select('*').order('scheduled_at', { ascending: true });
  if (opts.workerId)  q = q.eq('assigned_worker_id', opts.workerId);
  if (opts.clientId)  q = q.eq('client_id', opts.clientId);
  if (opts.status)    q = q.eq('status', opts.status);
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
}

export async function createTask(input: CreateTaskInput): Promise<FieldTask> {
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
    })
    .select('*').single();
  if (error) throw error;
  return rowToTask(data as TaskRow);
}

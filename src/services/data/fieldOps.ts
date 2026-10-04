/**
 * Data access for the field-ops tables (0006/0007). Every call throws on
 * error so screens can show a clear failure (§34) instead of assuming a save.
 * Business rules live in src/domain and are enforced again by the database.
 */
import { getSupabase } from '@/services/supabase/client';
import type {
  ConfigText,
  Employee,
  LaborAllocation,
  MonthClose,
  OperationalTarget,
  Project,
  ProjectRecurringItem,
  ProjectStage,
  ProjectTask,
  ProjectType,
  TaskPhoto,
  Visit,
  VisitReport,
  WorkType,
} from '@/domain/models/ops';
import type { Template } from '@/domain/models/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const u = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const sb = () => getSupabase();

/**
 * For updates/deletes: RLS filters rows silently (0 rows, no error). Treat
 * "nothing changed" as a failure so the screen never shows a false save (§31).
 */
function changed<T>(res: { data: T[] | null; error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.length === 0) {
    throw new Error('permission denied: nothing was saved (row-level security or record not found)');
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

export const toProjectType = (r: Row): ProjectType => ({
  id: r.id, code: r.code, name: r.name ?? {}, usesStages: !!r.uses_stages, sortOrder: r.sort_order ?? 0, active: r.active !== false,
});

export const toStage = (r: Row): ProjectStage => ({
  id: r.id, projectTypeId: r.project_type_id, code: r.code, name: r.name ?? {}, sortOrder: r.sort_order ?? 0, active: r.active !== false,
});

export const toProject = (r: Row): Project => ({
  id: r.id, code: u(r.code), name: r.name, clientId: r.client_id, projectTypeId: r.project_type_id,
  stageId: u(r.stage_id), status: r.status, supervisorId: u(r.supervisor_id), notes: u(r.notes),
  closedAt: u(r.closed_at), createdAt: r.created_at, updatedAt: r.updated_at,
});

export const toEmployee = (r: Row): Employee => ({
  id: r.id, code: u(r.code), fullName: r.full_name, phone: u(r.phone), status: r.status, notes: u(r.notes),
  createdAt: u(r.created_at), updatedAt: u(r.updated_at),
});

export const toVisit = (r: Row): Visit => ({
  id: r.id, projectId: r.project_id, visitDate: String(r.visit_date).slice(0, 10), supervisorId: r.supervisor_id,
  status: r.status, workTypeId: u(r.work_type_id), startedAt: u(r.started_at), completedAt: u(r.completed_at), notes: u(r.notes),
});

export const toTask = (r: Row): ProjectTask => ({
  id: r.id, projectId: r.project_id, visitId: u(r.visit_id), source: r.source, templateId: u(r.template_id),
  templateItemId: u(r.template_item_id), recurringItemId: u(r.recurring_item_id), description: r.description,
  status: r.status, required: r.required !== false, photoRequired: !!r.photo_required, note: u(r.note),
  completedAt: u(r.completed_at), completedInVisitId: u(r.completed_in_visit_id), lastVisitId: u(r.last_visit_id), followUpVisitId: u(r.follow_up_visit_id),
  createdAt: r.created_at,
});

export const toRecurring = (r: Row): ProjectRecurringItem => ({
  id: r.id, projectId: r.project_id, templateId: u(r.template_id), templateItemId: u(r.template_item_id),
  description: r.description, recurrence: r.recurrence, lastDoneOn: r.last_done_on ? String(r.last_done_on).slice(0, 10) : undefined,
  nextDueOn: String(r.next_due_on).slice(0, 10), photoRequired: !!r.photo_required, active: r.active !== false,
});

export const toPhoto = (r: Row): TaskPhoto => ({
  id: r.id, taskId: r.task_id, visitId: u(r.visit_id), projectId: r.project_id, kind: u(r.kind),
  storagePath: r.storage_path, mime: r.mime, capturedAt: r.captured_at, voidedAt: u(r.voided_at),
});

export const toLabor = (r: Row): LaborAllocation => ({
  id: r.id, workDate: String(r.work_date).slice(0, 10), employeeId: r.employee_id, projectId: u(r.project_id),
  operationalTargetId: u(r.operational_target_id), workTypeId: u(r.work_type_id), visitId: u(r.visit_id), duration: Number(r.duration) as LaborAllocation['duration'], supervisorId: r.supervisor_id,
  notes: u(r.notes), changeReason: u(r.change_reason), voidedAt: u(r.voided_at), voidReason: u(r.void_reason),
});

export const toWorkType = (r: Row): WorkType => ({
  id: r.id, code: r.code, name: r.name ?? {}, sortOrder: r.sort_order ?? 0, active: r.active !== false,
});

export const toTarget = (r: Row): OperationalTarget => ({
  id: r.id, code: r.code, name: r.name ?? {}, sortOrder: r.sort_order ?? 0, active: r.active !== false,
});

export const toMonthClose = (r: Row): MonthClose => ({
  month: String(r.month).slice(0, 10), closedAt: r.closed_at, closedBy: r.closed_by,
});

export const toReport = (r: Row): VisitReport => ({
  id: r.id, visitId: r.visit_id, reportNumber: Number(r.report_number), signatureStatus: r.signature_status,
  signerName: u(r.signer_name), signedAt: u(r.signed_at), generatedAt: r.generated_at, content: u(r.content),
});

export const toTemplate = (r: Row): Template & { active: boolean } => ({
  id: r.id, title: r.title, tasks: r.tasks ?? [], createdAt: r.created_at, updatedAt: r.updated_at,
  version: r.version ?? 1, projectTypeId: u(r.project_type_id), stageId: u(r.stage_id), active: r.active !== false,
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export async function listProjectTypes(): Promise<ProjectType[]> {
  const rows = check(await sb().from('project_types').select('*').order('sort_order'));
  return (rows as Row[]).map(toProjectType);
}

export async function saveProjectType(t: { id?: string; code: string; name: ConfigText; usesStages: boolean; sortOrder: number; active: boolean }): Promise<void> {
  const row = { code: t.code, name: t.name, uses_stages: t.usesStages, sort_order: t.sortOrder, active: t.active };
  if (t.id) changed(await sb().from('project_types').update(row).eq('id', t.id).select('id'));
  else check(await sb().from('project_types').insert(row));
}

export async function listStages(): Promise<ProjectStage[]> {
  const rows = check(await sb().from('project_stages').select('*').order('sort_order'));
  return (rows as Row[]).map(toStage);
}

export async function saveStage(s: { id?: string; projectTypeId: string; code: string; name: ConfigText; sortOrder: number; active: boolean }): Promise<void> {
  const row = { project_type_id: s.projectTypeId, code: s.code, name: s.name, sort_order: s.sortOrder, active: s.active };
  if (s.id) changed(await sb().from('project_stages').update(row).eq('id', s.id).select('id'));
  else check(await sb().from('project_stages').insert(row));
}

/** Work types (v2.2): managed list, switched off rather than deleted. */
export async function listWorkTypes(): Promise<WorkType[]> {
  const rows = check(await sb().from('work_types').select('*').order('sort_order'));
  return (rows as Row[]).map(toWorkType);
}

export async function saveWorkType(w: { id?: string; code: string; name: ConfigText; sortOrder: number; active: boolean }): Promise<void> {
  const row = { code: w.code, name: w.name, sort_order: w.sortOrder, active: w.active };
  if (w.id) changed(await sb().from('work_types').update(row).eq('id', w.id).select('id'));
  else check(await sb().from('work_types').insert(row));
}

/** Operational targets (v2.2): warehouse, office, leave… for days with no project. */
export async function listTargets(): Promise<OperationalTarget[]> {
  const rows = check(await sb().from('operational_targets').select('*').order('sort_order'));
  return (rows as Row[]).map(toTarget);
}

export async function saveTarget(o: { id?: string; code: string; name: ConfigText; sortOrder: number; active: boolean }): Promise<void> {
  const row = { code: o.code, name: o.name, sort_order: o.sortOrder, active: o.active };
  if (o.id) changed(await sb().from('operational_targets').update(row).eq('id', o.id).select('id'));
  else check(await sb().from('operational_targets').insert(row));
}

export async function listFieldTemplates(): Promise<(Template & { active: boolean })[]> {
  const rows = check(await sb().from('templates').select('*').order('updated_at', { ascending: false }));
  return (rows as Row[]).map(toTemplate);
}

/** Working weekdays (0 = Sunday). */
export async function getWorkDays(): Promise<number[]> {
  const { data } = await sb().from('app_settings').select('work_days').eq('id', true).maybeSingle();
  const days = (data as Row | null)?.work_days;
  return Array.isArray(days) && days.length ? days.map(Number) : [0, 1, 2, 3, 4, 6];
}

export async function saveWorkDays(days: number[]): Promise<void> {
  changed(await sb().from('app_settings').update({ work_days: [...days].sort() }).eq('id', true).select('id'));
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(opts: { supervisorId?: string; status?: Project['status'] } = {}): Promise<Project[]> {
  let q = sb().from('projects').select('*');
  if (opts.supervisorId) q = q.eq('supervisor_id', opts.supervisorId);
  if (opts.status) q = q.eq('status', opts.status);
  const rows = check(await q.order('name'));
  return (rows as Row[]).map(toProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const row = check(await sb().from('projects').select('*').eq('id', id).maybeSingle());
  return row ? toProject(row as Row) : null;
}

export interface ProjectInput {
  code?: string;
  name: string;
  clientId: string;
  projectTypeId: string;
  stageId?: string;
  supervisorId?: string;
  notes?: string;
}

function projectRow(p: ProjectInput): Row {
  return {
    code: p.code?.trim() || null, name: p.name.trim(), client_id: p.clientId, project_type_id: p.projectTypeId,
    stage_id: p.stageId || null, supervisor_id: p.supervisorId || null, notes: p.notes?.trim() || null,
  };
}

export async function createProject(p: ProjectInput): Promise<Project> {
  const row = check(await sb().from('projects').insert(projectRow(p)).select().single());
  return toProject(row as Row);
}

export async function updateProject(id: string, p: Partial<ProjectInput> & { status?: Project['status'] }): Promise<void> {
  const row: Row = {};
  if (p.code !== undefined) row.code = p.code.trim() || null;
  if (p.name !== undefined) row.name = p.name.trim();
  if (p.clientId !== undefined) row.client_id = p.clientId;
  if (p.projectTypeId !== undefined) row.project_type_id = p.projectTypeId;
  if (p.stageId !== undefined) row.stage_id = p.stageId || null;
  if (p.supervisorId !== undefined) row.supervisor_id = p.supervisorId || null;
  if (p.notes !== undefined) row.notes = p.notes.trim() || null;
  if (p.status) row.status = p.status;
  changed(await sb().from('projects').update(row).eq('id', id).select('id'));
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function listEmployees(): Promise<Employee[]> {
  const rows = check(await sb().from('employees').select('*').order('full_name'));
  return (rows as Row[]).map(toEmployee);
}

export async function saveEmployee(e: { id?: string; code?: string; fullName: string; phone?: string; status: Employee['status']; notes?: string }): Promise<void> {
  const row = { code: e.code?.trim() || null, full_name: e.fullName.trim(), phone: e.phone?.trim() || null, status: e.status, notes: e.notes?.trim() || null };
  if (e.id) changed(await sb().from('employees').update(row).eq('id', e.id).select('id'));
  else check(await sb().from('employees').insert(row));
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export async function listVisits(opts: { projectId?: string; projectIds?: string[]; from?: string; to?: string; status?: Visit['status'] } = {}): Promise<Visit[]> {
  if (opts.projectIds && opts.projectIds.length === 0) return [];
  let q = sb().from('visits').select('*');
  if (opts.projectId) q = q.eq('project_id', opts.projectId);
  if (opts.projectIds) q = q.in('project_id', opts.projectIds);
  if (opts.from) q = q.gte('visit_date', opts.from);
  if (opts.to) q = q.lte('visit_date', opts.to);
  if (opts.status) q = q.eq('status', opts.status);
  const rows = check(await q.order('visit_date', { ascending: false }));
  return (rows as Row[]).map(toVisit);
}

export async function getVisit(id: string): Promise<Visit | null> {
  const row = check(await sb().from('visits').select('*').eq('id', id).maybeSingle());
  return row ? toVisit(row as Row) : null;
}

export async function createVisit(v: { projectId: string; visitDate: string; supervisorId: string; notes?: string; workTypeId?: string }): Promise<Visit> {
  const row = check(await sb().from('visits').insert({
    project_id: v.projectId, visit_date: v.visitDate, supervisor_id: v.supervisorId, notes: v.notes || null,
    ...(v.workTypeId ? { work_type_id: v.workTypeId } : {}),
  }).select().single());
  return toVisit(row as Row);
}

export async function updateVisit(id: string, patch: { status?: Visit['status']; supervisorId?: string; notes?: string; visitDate?: string; workTypeId?: string }): Promise<void> {
  const row: Row = {};
  if (patch.workTypeId) row.work_type_id = patch.workTypeId;
  if (patch.status) row.status = patch.status;
  if (patch.supervisorId) row.supervisor_id = patch.supervisorId;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  if (patch.visitDate) row.visit_date = patch.visitDate;
  changed(await sb().from('visits').update(row).eq('id', id).select('id'));
}

export async function deletePlannedVisit(id: string): Promise<void> {
  changed(await sb().from('visits').delete().eq('id', id).select('id'));
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks(opts: { projectId?: string; projectIds?: string[] } = {}): Promise<ProjectTask[]> {
  if (opts.projectIds && opts.projectIds.length === 0) return [];
  let q = sb().from('project_tasks').select('*');
  if (opts.projectId) q = q.eq('project_id', opts.projectId);
  if (opts.projectIds) q = q.in('project_id', opts.projectIds);
  const rows = check(await q.order('created_at'));
  return (rows as Row[]).map(toTask);
}

export type TaskInsert = Pick<ProjectTask, 'projectId' | 'description' | 'source' | 'required' | 'photoRequired'>
  & Partial<Pick<ProjectTask, 'id' | 'visitId' | 'templateId' | 'templateItemId' | 'recurringItemId' | 'note'>>;

export async function createTasks(tasks: TaskInsert[]): Promise<void> {
  if (tasks.length === 0) return;
  check(await sb().from('project_tasks').insert(tasks.map((t) => ({
    ...(t.id ? { id: t.id } : {}),
    project_id: t.projectId, visit_id: t.visitId ?? null, source: t.source, template_id: t.templateId ?? null,
    template_item_id: t.templateItemId ?? null, recurring_item_id: t.recurringItemId ?? null,
    description: t.description, required: t.required, photo_required: t.photoRequired, note: t.note ?? null,
  }))));
}

export type TaskAnswer = 'done' | 'not_done' | 'follow_up';

/**
 * Records the supervisor's answer for a task on a visit. A follow-up can't go
 * back to open, so "not done" on a follow-up keeps it as a follow-up.
 */
export async function answerTask(
  task: Pick<ProjectTask, 'id' | 'status'> & Partial<Pick<ProjectTask, 'followUpVisitId' | 'lastVisitId' | 'note'>>,
  visitId: string,
  answer: TaskAnswer,
  note?: string,
): Promise<void> {
  const row: Row = { last_visit_id: visitId };
  if (answer === 'done') { row.status = 'completed'; row.completed_in_visit_id = visitId; }
  if (answer === 'follow_up') row.status = 'needs_follow_up';
  if (answer === 'not_done' && task.status === 'completed') row.status = 'open';
  // A follow-up set by mistake on this same visit can still become "not done" (0008).
  if (answer === 'not_done' && task.status === 'needs_follow_up' && task.followUpVisitId === visitId) row.status = 'open';
  if (note !== undefined) row.note = note.trim() || null;
  // Done now: a reason left on an earlier visit ("not delivered yet") no longer applies,
  // so it does not appear under a done item in this visit's report (UAT v2.2 D3).
  else if (answer === 'done' && task.note && task.lastVisitId && task.lastVisitId !== visitId) row.note = null;
  changed(await sb().from('project_tasks').update(row).eq('id', task.id).select('id'));
}

/** The answer given on this visit, if any. */
export function answerOnVisit(t: Pick<ProjectTask, 'status' | 'lastVisitId' | 'completedInVisitId'>, visitId: string): TaskAnswer | null {
  if (t.completedInVisitId === visitId && t.status === 'completed') return 'done';
  if (t.lastVisitId !== visitId) return null;
  return t.status === 'needs_follow_up' ? 'follow_up' : t.status === 'open' ? 'not_done' : null;
}

/** Manager corrects the wording of a task that has not been on a visit yet. */
export async function updateTaskDescription(id: string, description: string): Promise<void> {
  changed(await sb().from('project_tasks').update({ description: description.trim() }).eq('id', id).select('id'));
}

/**
 * Manager closes a task that is no longer needed. Tasks are never deleted
 * (BR-014): it is completed with the reason as its note, and stays on record.
 */
export async function closeTaskNotNeeded(id: string, reason: string): Promise<void> {
  changed(await sb().from('project_tasks').update({ status: 'completed', note: reason.trim() }).eq('id', id).select('id'));
}

export async function updateTaskNote(id: string, note: string): Promise<void> {
  changed(await sb().from('project_tasks').update({ note: note.trim() || null }).eq('id', id).select('id'));
}


// ---------------------------------------------------------------------------
// Recurring items
// ---------------------------------------------------------------------------

export async function listRecurring(opts: { projectId?: string; projectIds?: string[] } = {}): Promise<ProjectRecurringItem[]> {
  if (opts.projectIds && opts.projectIds.length === 0) return [];
  let q = sb().from('project_recurring_items').select('*');
  if (opts.projectId) q = q.eq('project_id', opts.projectId);
  if (opts.projectIds) q = q.in('project_id', opts.projectIds);
  const rows = check(await q.order('next_due_on'));
  return (rows as Row[]).map(toRecurring);
}

export async function createRecurring(items: Omit<ProjectRecurringItem, 'id' | 'lastDoneOn'>[]): Promise<void> {
  if (items.length === 0) return;
  check(await sb().from('project_recurring_items').insert(items.map((i) => ({
    project_id: i.projectId, template_id: i.templateId ?? null, template_item_id: i.templateItemId ?? null,
    description: i.description, recurrence: i.recurrence, next_due_on: i.nextDueOn,
    photo_required: i.photoRequired, active: i.active,
  }))));
}

export async function updateRecurring(id: string, patch: Partial<Pick<ProjectRecurringItem, 'description' | 'recurrence' | 'nextDueOn' | 'photoRequired' | 'active'>>): Promise<void> {
  const row: Row = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.recurrence) row.recurrence = patch.recurrence;
  if (patch.nextDueOn) row.next_due_on = patch.nextDueOn;
  if (patch.photoRequired !== undefined) row.photo_required = patch.photoRequired;
  if (patch.active !== undefined) row.active = patch.active;
  changed(await sb().from('project_recurring_items').update(row).eq('id', id).select('id'));
}

// ---------------------------------------------------------------------------
// Photos (object storage + metadata row, never base64 in tables — §33)
// ---------------------------------------------------------------------------

export async function listPhotos(opts: { projectId?: string; visitId?: string; taskIds?: string[] } = {}): Promise<TaskPhoto[]> {
  if (opts.taskIds && opts.taskIds.length === 0) return [];
  let q = sb().from('task_photos').select('*');
  if (opts.projectId) q = q.eq('project_id', opts.projectId);
  if (opts.visitId) q = q.eq('visit_id', opts.visitId);
  if (opts.taskIds) q = q.in('task_id', opts.taskIds);
  const rows = check(await q.order('captured_at'));
  return (rows as Row[]).map(toPhoto).filter((p) => !p.voidedAt);
}

/**
 * Uploads the file, then records it. Fails loudly: the caller shows the error
 * and keeps the photo on screen so nothing is silently lost (§31).
 */
export async function uploadTaskPhoto(input: {
  taskId: string; visitId?: string; projectId: string; kind?: 'before' | 'after'; file: Blob; mime: string;
}): Promise<void> {
  const ext = input.mime.split('/')[1]?.split(';')[0] ?? 'bin';
  const path = `field/${input.projectId}/${input.taskId}/${input.kind ?? 'photo'}-${crypto.randomUUID()}.${ext}`;
  const up = await sb().storage.from('proofs').upload(path, input.file, { contentType: input.mime, upsert: false });
  if (up.error) throw new Error(up.error.message);
  check(await sb().from('task_photos').insert({
    task_id: input.taskId, visit_id: input.visitId ?? null, project_id: input.projectId, kind: input.kind ?? null,
    storage_path: path, mime: input.mime, captured_at: new Date().toISOString(),
  }));
}

export async function voidPhoto(id: string, reason: string): Promise<void> {
  changed(await sb().from('task_photos').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', id).select('id'));
}

// ---------------------------------------------------------------------------
// Labor
// ---------------------------------------------------------------------------

export async function listLabor(opts: { from?: string; to?: string; projectId?: string; targetId?: string; visitId?: string; employeeId?: string; workTypeId?: string; includeVoided?: boolean } = {}): Promise<LaborAllocation[]> {
  let q = sb().from('labor_allocations').select('*');
  if (opts.targetId) q = q.eq('operational_target_id', opts.targetId);
  if (opts.workTypeId) q = q.eq('work_type_id', opts.workTypeId);
  if (opts.from) q = q.gte('work_date', opts.from);
  if (opts.to) q = q.lte('work_date', opts.to);
  if (opts.projectId) q = q.eq('project_id', opts.projectId);
  if (opts.visitId) q = q.eq('visit_id', opts.visitId);
  if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
  const rows = check(await q.order('work_date', { ascending: false }));
  const all = (rows as Row[]).map(toLabor);
  return opts.includeVoided ? all : all.filter((a) => !a.voidedAt);
}

/** Day totals across all projects (0007 employee_day_load). Key: `${employeeId}|${date}`. */
export async function dayLoads(from: string, to: string): Promise<Map<string, number>> {
  const rows = check(await sb().rpc('employee_day_load', { p_from: from, p_to: to }));
  const map = new Map<string, number>();
  for (const r of (rows ?? []) as Row[]) map.set(`${r.employee_id}|${String(r.work_date).slice(0, 10)}`, Number(r.total));
  return map;
}

/** One statement → all rows or none (BR-004, TC-03). */
export async function insertCrew(rows: (Pick<LaborAllocation, 'workDate' | 'employeeId' | 'duration' | 'supervisorId'>
  & Partial<Pick<LaborAllocation, 'projectId' | 'operationalTargetId' | 'visitId' | 'workTypeId'>> & { changeReason?: string })[]): Promise<void> {
  if (rows.length === 0) return;
  check(await sb().from('labor_allocations').insert(rows.map((r) => ({
    work_date: r.workDate, employee_id: r.employeeId, project_id: r.projectId ?? null,
    operational_target_id: r.operationalTargetId ?? null, visit_id: r.visitId ?? null,
    // A visit's crew takes the visit's work type in the database (TC-13).
    ...(r.workTypeId ? { work_type_id: r.workTypeId } : {}),
    duration: r.duration, supervisor_id: r.supervisorId,
    ...(r.changeReason ? { change_reason: r.changeReason } : {}),
  }))));
}

export async function updateLabor(id: string, patch: { duration?: 0.5 | 1; notes?: string; changeReason?: string; workDate?: string; projectId?: string; employeeId?: string; workTypeId?: string }): Promise<void> {
  const row: Row = {};
  if (patch.workTypeId) row.work_type_id = patch.workTypeId;
  if (patch.duration !== undefined) row.duration = patch.duration;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  if (patch.changeReason !== undefined) row.change_reason = patch.changeReason || null;
  if (patch.workDate) row.work_date = patch.workDate;
  if (patch.projectId) row.project_id = patch.projectId;
  if (patch.employeeId) row.employee_id = patch.employeeId;
  changed(await sb().from('labor_allocations').update(row).eq('id', id).select('id'));
}

export async function voidLabor(id: string, reason: string, changeReason?: string): Promise<void> {
  changed(await sb().from('labor_allocations').update({
    voided_at: new Date().toISOString(), void_reason: reason, ...(changeReason ? { change_reason: changeReason } : {}),
  }).eq('id', id).select('id'));
}

// ---------------------------------------------------------------------------
// Month close
// ---------------------------------------------------------------------------

export async function listMonthCloses(): Promise<MonthClose[]> {
  const rows = check(await sb().from('month_closes').select('*').order('month', { ascending: false }));
  return (rows as Row[]).map(toMonthClose);
}

export async function closeMonth(month: string): Promise<void> {
  check(await sb().from('month_closes').insert({ month }));
}

// ---------------------------------------------------------------------------
// Visit reports
// ---------------------------------------------------------------------------

export async function getReportForVisit(visitId: string): Promise<VisitReport | null> {
  const row = check(await sb().from('visit_reports').select('*').eq('visit_id', visitId).maybeSingle());
  return row ? toReport(row as Row) : null;
}

export async function listReports(visitIds: string[]): Promise<VisitReport[]> {
  if (visitIds.length === 0) return [];
  const rows = check(await sb().from('visit_reports').select('*').in('visit_id', visitIds));
  return (rows as Row[]).map(toReport);
}

export async function createReport(visitId: string, content: unknown): Promise<VisitReport> {
  const row = check(await sb().from('visit_reports').insert({ visit_id: visitId, content }).select().single());
  return toReport(row as Row);
}

export async function updateReport(id: string, patch: { signerName?: string; content?: unknown }): Promise<void> {
  const row: Row = {};
  if (patch.signerName !== undefined) row.signer_name = patch.signerName || null;
  if (patch.content !== undefined) row.content = patch.content;
  changed(await sb().from('visit_reports').update(row).eq('id', id).select('id'));
}

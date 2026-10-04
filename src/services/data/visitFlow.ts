/**
 * The supervisor's visit cycle (Master Spec §5): start → crew → work →
 * complete → report. Each step saves or fails as a whole; the database
 * re-checks every rule.
 */
import type { LaborDuration, Project, ProjectTask, Visit, VisitReport } from '@/domain/models/ops';
import type { Language } from '@/domain/models/types';
import { buildReportContent, buildVisitTasks, labelText } from '@/domain/fieldops/visitPlan';
import { isMonthClosed } from '@/domain/labor/allocation';
import {
  createReport,
  createTasks,
  createVisit,
  dayLoads,
  listMonthCloses,
  deletePlannedVisit,
  getReportForVisit,
  insertCrew,
  listFieldTemplates,
  listLabor,
  listPhotos,
  listRecurring,
  listTasks,
  updateReport,
  updateVisit,
} from './fieldOps';

export interface StartVisitInput {
  project: Pick<Project, 'id' | 'projectTypeId' | 'stageId'>;
  supervisorId: string;
  /** YYYY-MM-DD */
  date: string;
  crew: { employeeId: string; duration: LaborDuration }[];
  /** Chosen once for the visit and applied to its crew (v2.2, TC-13). */
  workTypeId: string;
  /** Start a visit the manager already planned instead of creating one. */
  plannedVisit?: Visit;
}

/**
 * Creates (or takes) the visit, books the crew in one statement, marks it in
 * progress and adds the due checklist. If the crew is refused (e.g. BR-001),
 * a visit created here is removed again so nothing half-saved is left.
 */
/** Same checks the database makes, before anything is written (UAT D-02). */
async function precheckCrew(date: string, crew: { employeeId: string; duration: LaborDuration }[]): Promise<void> {
  const [loads, closes] = await Promise.all([dayLoads(date, date), listMonthCloses()]);
  if (isMonthClosed(date, closes)) throw new Error(`BR-009: labor for ${date.slice(0, 7)} is closed`);
  for (const c of crew) {
    const booked = loads.get(`${c.employeeId}|${date}`) ?? 0;
    if (booked + c.duration > 1) {
      throw new Error(`BR-001: employee already has ${booked} day(s) on ${date}; adding ${c.duration} would exceed 1.0`);
    }
  }
}

export async function startVisit(input: StartVisitInput): Promise<string> {
  if (!input.workTypeId) throw new Error('WORK-TYPE: choose the work type of the visit first');
  // Check the crew first so a refused start leaves nothing behind — not even a
  // created-then-removed visit in the audit log (UAT D-02). The database still
  // re-checks under a lock (BR-001, TC-12) in case two supervisors race.
  await precheckCrew(input.date, input.crew);
  let visit = input.plannedVisit ?? await createVisit({
    projectId: input.project.id, visitDate: input.date, supervisorId: input.supervisorId, workTypeId: input.workTypeId,
  });
  // A planned visit is started on the day it actually happens (and by whoever starts it).
  if (input.plannedVisit && (visit.visitDate !== input.date || visit.supervisorId !== input.supervisorId || visit.workTypeId !== input.workTypeId)) {
    await updateVisit(visit.id, { visitDate: input.date, supervisorId: input.supervisorId, workTypeId: input.workTypeId });
    visit = { ...visit, visitDate: input.date, supervisorId: input.supervisorId, workTypeId: input.workTypeId };
  }
  try {
    await insertCrew(input.crew.map((c) => ({
      workDate: input.date, employeeId: c.employeeId, projectId: input.project.id, visitId: visit.id,
      duration: c.duration, supervisorId: input.supervisorId,
    })));
  } catch (e) {
    if (!input.plannedVisit) await deletePlannedVisit(visit.id).catch(() => undefined);
    throw e;
  }
  await updateVisit(visit.id, { status: 'in_progress' });
  await syncVisitTasks(input.project, visit.id, input.date);
  return visit.id;
}

/**
 * A day with no project (v2.2 §17, TC-14): the crew is booked on an
 * operational target (warehouse, office, leave…) with a work type. No visit,
 * checklist or client report — and no fake project. All rows or none.
 */
export async function recordTargetDay(input: {
  targetId: string; workTypeId: string; supervisorId: string; date: string;
  crew: { employeeId: string; duration: LaborDuration }[];
}): Promise<void> {
  if (!input.workTypeId) throw new Error('WORK-TYPE: a work type is required');
  await precheckCrew(input.date, input.crew);
  await insertCrew(input.crew.map((c) => ({
    workDate: input.date, employeeId: c.employeeId, operationalTargetId: input.targetId, workTypeId: input.workTypeId,
    duration: c.duration, supervisorId: input.supervisorId,
  })));
}

/**
 * Adds the required checklist / stage / due periodic items missing from the
 * visit. Safe to repeat. Optional checklist items are not saved here: they are
 * offered on the visit (optionalVisitItems) and saved only when the supervisor
 * uses one, so nothing ever has to be deleted afterwards (BR-014).
 */
export async function syncVisitTasks(
  project: Pick<Project, 'id' | 'projectTypeId' | 'stageId'>,
  visitId: string,
  date: string,
): Promise<number> {
  const [templates, projectTasks, recurringItems] = await Promise.all([
    listFieldTemplates(), listTasks({ projectId: project.id }), listRecurring({ projectId: project.id }),
  ]);
  const rows = buildVisitTasks({
    project, visitId, date, templates, projectTasks, recurringItems, newId: () => crypto.randomUUID(),
  }).filter((r) => r.required);
  await createTasks(rows);
  return rows.length;
}

/**
 * Optional checklist items the visit can use, not saved yet (`pending`). Their
 * ids are stable per template item so the screen keeps its state between loads.
 */
export async function optionalVisitItems(
  project: Pick<Project, 'id' | 'projectTypeId' | 'stageId'>,
  visitId: string,
  date: string,
): Promise<ProjectTask[]> {
  const [templates, projectTasks, recurringItems] = await Promise.all([
    listFieldTemplates(), listTasks({ projectId: project.id }), listRecurring({ projectId: project.id }),
  ]);
  return buildVisitTasks({ project, visitId, date, templates, projectTasks, recurringItems, newId: () => '' })
    .filter((r) => !r.required)
    .map((r) => ({
      ...r,
      id: `optional:${r.templateId}:${r.templateItemId}`,
      pending: true,
      createdAt: '',
    }));
}

/** Saves an optional item the supervisor started using; returns the saved task. */
export async function saveOptionalItem(task: ProjectTask): Promise<ProjectTask> {
  if (!task.pending) return task;
  const id = crypto.randomUUID();
  await createTasks([{
    id, projectId: task.projectId, visitId: task.visitId, source: task.source, templateId: task.templateId,
    templateItemId: task.templateItemId, description: task.description, required: false, photoRequired: task.photoRequired,
  }]);
  return { ...task, id, pending: false };
}

export interface ReportNames {
  projectName: string;
  projectCode?: string;
  clientName: string;
  supervisorName: string;
  employeeName: (id: string) => string;
  taskLabel: (t: ProjectTask) => string;
}

/** Builds the report from what was recorded on the visit (BR-013). */
export async function generateReportContent(visit: Visit, names: ReportNames, reportNumber?: number, clientRepName?: string) {
  const [tasks, photos, crew] = await Promise.all([
    listTasks({ projectId: visit.projectId }),
    listPhotos({ visitId: visit.id }),
    listLabor({ visitId: visit.id }),
  ]);
  return buildReportContent({
    visitId: visit.id,
    reportNumber,
    project: { name: names.projectName, code: names.projectCode },
    clientName: names.clientName,
    visitDate: visit.visitDate,
    supervisorName: names.supervisorName,
    completedAt: visit.completedAt,
    tasks: tasks.map((t) => ({ ...t, label: names.taskLabel(t) })),
    photos,
    crew: crew.map((a) => ({ name: names.employeeName(a.employeeId), duration: a.duration })),
    clientRepName,
    visitNotes: visit.notes,
  });
}

/**
 * Completes the visit (follow-ups stay open — BR-005) and issues the report
 * with frozen content. Nothing recorded on the visit is deleted (BR-014).
 */
export async function completeVisit(visit: Visit, names: ReportNames): Promise<VisitReport> {
  await updateVisit(visit.id, { status: 'completed' });
  const closed: Visit = { ...visit, status: 'completed', completedAt: new Date().toISOString() };
  const existing = await getReportForVisit(visit.id);
  if (existing?.content) return existing;   // issued reports are never rewritten
  if (existing) {
    const content = await generateReportContent(closed, names, existing.reportNumber, existing.signerName);
    await updateReport(existing.id, { content });
    return { ...existing, content };
  }
  const report = await createReport(visit.id, null);
  const content = await generateReportContent(closed, names, report.reportNumber);
  await updateReport(report.id, { content });
  return { ...report, content };
}

/** Localized label for a task created from a template item; falls back to its description. */
export function makeTaskLabeler(
  templates: { id: string; tasks: { id: string; label: Record<string, string> }[] }[],
  language: Language | 'ur',
): (t: Pick<ProjectTask, 'templateId' | 'templateItemId' | 'description'>) => string {
  const index = new Map<string, Record<string, string>>();
  for (const tpl of templates) for (const it of tpl.tasks) index.set(`${tpl.id}|${it.id}`, it.label);
  return (t) => {
    const label = t.templateId && t.templateItemId ? index.get(`${t.templateId}|${t.templateItemId}`) : undefined;
    // Translate only an unchanged template wording; a description management
    // rewrote is shown as written.
    if (!label || !Object.values(label).includes(t.description)) return t.description;
    return labelText(label, language) || t.description;
  };
}

/**
 * The supervisor's visit cycle (Master Spec §5): start → crew → work →
 * complete → report. Each step saves or fails as a whole; the database
 * re-checks every rule.
 */
import type { LaborDuration, Project, ProjectTask, Visit, VisitReport } from '@/domain/models/ops';
import type { Language } from '@/domain/models/types';
import { buildReportContent, buildVisitTasks, labelText } from '@/domain/fieldops/visitPlan';
import { skippedOptionalItems } from '@/domain/fieldops/fieldOps';
import {
  createReport,
  createTasks,
  createVisit,
  deletePlannedVisit,
  deleteTasks,
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
  /** Start a visit the manager already planned instead of creating one. */
  plannedVisit?: Visit;
}

/**
 * Creates (or takes) the visit, books the crew in one statement, marks it in
 * progress and adds the due checklist. If the crew is refused (e.g. BR-001),
 * a visit created here is removed again so nothing half-saved is left.
 */
export async function startVisit(input: StartVisitInput): Promise<string> {
  let visit = input.plannedVisit ?? await createVisit({
    projectId: input.project.id, visitDate: input.date, supervisorId: input.supervisorId,
  });
  // A planned visit is started on the day it actually happens (and by whoever starts it).
  if (input.plannedVisit && (visit.visitDate !== input.date || visit.supervisorId !== input.supervisorId)) {
    await updateVisit(visit.id, { visitDate: input.date, supervisorId: input.supervisorId });
    visit = { ...visit, visitDate: input.date, supervisorId: input.supervisorId };
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

/** Adds any checklist / due periodic items missing from the visit. Safe to repeat. */
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
  });
  await createTasks(rows);
  return rows.length;
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
  });
}

/**
 * Completes the visit: drops untouched optional items, closes the visit
 * (follow-ups stay open — BR-005) and issues the report with frozen content.
 */
export async function completeVisit(visit: Visit, names: ReportNames): Promise<VisitReport> {
  const [tasks, photos] = await Promise.all([listTasks({ projectId: visit.projectId }), listPhotos({ visitId: visit.id })]);
  await deleteTasks(skippedOptionalItems(visit.id, tasks, new Set(photos.map((p) => p.taskId))));
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
    return label ? labelText(label, language) || t.description : t.description;
  };
}

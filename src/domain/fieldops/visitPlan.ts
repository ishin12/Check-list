/**
 * What a visit contains (Master Spec §5 step 4, §8, §9) and what its report
 * says (§12). Pure functions: the screens and tests feed them rows.
 */
import type {
  Project,
  ProjectRecurringItem,
  ProjectTask,
  TaskItemSource,
  TaskItemStatus,
  VisitReportContent,
  VisitReportTaskLine,
} from '@/domain/models/ops';
import type { Language, LocalizedText, Template } from '@/domain/models/types';
import { answeredOnVisit, dueRecurringItems, isTaskOpen } from './fieldOps';

type ScopedTemplate = Template & { active?: boolean };

/**
 * Templates that apply to a project: its type's checklists (no stage) plus the
 * checklist of its current stage.
 */
export function applicableTemplates<T extends ScopedTemplate>(
  project: Pick<Project, 'projectTypeId' | 'stageId'>,
  templates: T[],
): T[] {
  return templates.filter((t) => {
    if (t.active === false) return false;
    if (t.stageId) return t.stageId === project.stageId;
    return !!t.projectTypeId && t.projectTypeId === project.projectTypeId;
  });
}

export function labelText(label: Partial<LocalizedText> & { ur?: string }, language: Language | 'ur' = 'en'): string {
  return (label as Record<string, string | undefined>)[language] || label.en || label.ar || '';
}

export type NewTask = Pick<
  ProjectTask,
  'id' | 'projectId' | 'visitId' | 'source' | 'templateId' | 'templateItemId' | 'recurringItemId'
  | 'description' | 'status' | 'photoRequired' | 'required'
>;

export interface BuildVisitInput {
  project: Pick<Project, 'id' | 'projectTypeId' | 'stageId'>;
  visitId: string;
  /** YYYY-MM-DD */
  date: string;
  templates: ScopedTemplate[];
  /** All tasks of the project (any status). */
  projectTasks: (Pick<ProjectTask, 'templateId' | 'templateItemId' | 'recurringItemId' | 'status' | 'source'>
    & Partial<Pick<ProjectTask, 'visitId' | 'completedInVisitId'>>)[];
  recurringItems: ProjectRecurringItem[];
  newId: () => string;
}

/**
 * Tasks to create when a visit starts. Open and follow-up tasks already on the
 * project are not duplicated; they show on the visit as they are (BR-006).
 *
 *  - Type checklist items (no recurrence): once per visit, unless still open.
 *  - Stage checklist items: once per project; completed stage items stay done.
 *  - Recurring maintenance: when due (or overdue) and not already open (§31).
 */
export function buildVisitTasks(input: BuildVisitInput): NewTask[] {
  const { project, visitId, date, templates, projectTasks, recurringItems, newId } = input;
  const out: NewTask[] = [];
  // Already on this visit: created for it, or completed during it. Keeps
  // "Refresh checklist" from adding a second copy of something just done.
  const onThisVisit = (t: BuildVisitInput['projectTasks'][number]) => t.visitId === visitId || t.completedInVisitId === visitId;
  const hasTask = (templateId: string, itemId: string, openOnly: boolean) =>
    projectTasks.some((t) => t.templateId === templateId && t.templateItemId === itemId
      && (!openOnly || isTaskOpen(t) || onThisVisit(t)));

  for (const tpl of applicableTemplates(project, templates)) {
    const source: TaskItemSource = tpl.stageId ? 'stage' : 'checklist';
    for (const item of [...tpl.tasks].sort((a, b) => a.order - b.order)) {
      if (item.recurrence && item.recurrence !== 'none') continue;   // handled as recurring items
      if (hasTask(tpl.id, item.id, source === 'checklist')) continue;
      out.push({
        id: newId(),
        projectId: project.id,
        visitId,
        source,
        templateId: tpl.id,
        templateItemId: item.id,
        description: labelText(item.label),
        status: 'open',
        photoRequired: item.photoRequired === true,
        // Required stage items gate the next stage; an item that may not apply
        // (e.g. agricultural wool) is left optional by management.
        required: item.required === true,
      });
    }
  }

  for (const r of dueRecurringItems(project.id, date, recurringItems)) {
    // Open, or done on this visit (the item only rolls forward when the visit completes).
    const covered = projectTasks.some((t) => t.recurringItemId === r.id && (isTaskOpen(t) || onThisVisit(t)));
    if (covered) continue;
    out.push({
      id: newId(),
      projectId: project.id,
      visitId,
      source: 'recurring',
      templateId: r.templateId,
      templateItemId: r.templateItemId,
      recurringItemId: r.id,
      description: r.description,
      status: 'open',
      photoRequired: r.photoRequired,
      required: true,
    });
  }
  return out;
}

/**
 * Recurring items a project should track from its templates' periodic items
 * (§8: management sets the frequency). Existing items are left alone.
 */
export function recurringItemsFromTemplates(
  project: Pick<Project, 'id' | 'projectTypeId' | 'stageId'>,
  templates: ScopedTemplate[],
  existing: Pick<ProjectRecurringItem, 'templateId' | 'templateItemId'>[],
  firstDue: string,
  newId: () => string,
): Omit<ProjectRecurringItem, 'lastDoneOn'>[] {
  const out: Omit<ProjectRecurringItem, 'lastDoneOn'>[] = [];
  for (const tpl of applicableTemplates(project, templates)) {
    for (const item of tpl.tasks) {
      if (!item.recurrence || item.recurrence === 'none') continue;
      if (existing.some((e) => e.templateId === tpl.id && e.templateItemId === item.id)) continue;
      out.push({
        id: newId(),
        projectId: project.id,
        templateId: tpl.id,
        templateItemId: item.id,
        description: labelText(item.label),
        recurrence: item.recurrence,
        nextDueOn: firstDue,
        photoRequired: item.photoRequired === true,
        active: true,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Visit report (§12, BR-013): generated from recorded data, no re-entry.
// ---------------------------------------------------------------------------

export interface ReportInput {
  visitId: string;
  reportNumber?: number;
  project: { name: string; code?: string };
  clientName: string;
  visitDate: string;
  supervisorName: string;
  completedAt?: string;
  tasks: (Pick<ProjectTask, 'id' | 'description' | 'status' | 'note' | 'lastVisitId' | 'completedInVisitId'> & {
    /** Display text in the report language, when it differs from description. */
    label?: string;
  })[];
  photos: { id: string; taskId: string; visitId?: string; kind?: 'before' | 'after'; storagePath: string; mime: string; voidedAt?: string }[];
  crew: { name: string; duration: number }[];
  clientRepName?: string;
  visitNotes?: string;
}

export function buildReportContent(input: ReportInput): VisitReportContent {
  const line = (t: ReportInput['tasks'][number], status: TaskItemStatus): VisitReportTaskLine => ({
    taskId: t.id,
    description: t.label || t.description,
    status,
    note: t.note,
    photos: input.photos
      .filter((p) => p.taskId === t.id && p.visitId === input.visitId && !p.voidedAt)
      .map((p) => ({ id: p.id, kind: p.kind, storagePath: p.storagePath, mime: p.mime })),
  });
  const onVisit = input.tasks.filter((t) => answeredOnVisit({ ...t, status: t.status }, input.visitId));
  const required = onVisit.map((t) => line(t, t.completedInVisitId === input.visitId ? 'completed' : t.status));
  return {
    reportNumber: input.reportNumber,
    projectName: input.project.name,
    projectCode: input.project.code,
    clientName: input.clientName,
    visitDate: input.visitDate,
    supervisorName: input.supervisorName,
    completedAt: input.completedAt,
    required,
    done: required.filter((l) => l.status === 'completed'),
    followUp: required.filter((l) => l.status !== 'completed'),
    crew: input.crew,
    clientRepName: input.clientRepName,
    ...(input.visitNotes ? { visitNotes: input.visitNotes } : {}),
  };
}

export interface StageProgress {
  stageId: string;
  /** Required checklist items of the stage (non-periodic). */
  required: { templateId: string; itemId: string; label: Partial<LocalizedText> & { ur?: string } }[];
  /** The subset not completed on this project yet. */
  missing: StageProgress['required'];
}

/**
 * What stands between a project and its next stage (§9, mirrors migration
 * 0008 stage_missing_items): every required item of the stage's active
 * checklists must be completed on the project.
 */
export function stageProgress(
  projectId: string,
  stageId: string,
  templates: ScopedTemplate[],
  tasks: Pick<ProjectTask, 'projectId' | 'templateId' | 'templateItemId' | 'status'>[],
): StageProgress {
  const required = templates
    .filter((t) => t.stageId === stageId && t.active !== false)
    .flatMap((t) => t.tasks
      .filter((i) => i.required === true && (!i.recurrence || i.recurrence === 'none'))
      .map((i) => ({ templateId: t.id, itemId: i.id, label: i.label })));
  const missing = required.filter((r) => !tasks.some((x) => x.projectId === projectId && x.templateId === r.templateId
    && x.templateItemId === r.itemId && x.status === 'completed'));
  return { stageId, required, missing };
}

/**
 * Project, visit and task rules (Master Spec §7–9, §27, BR-005/006/011).
 * Mirrors the guards in supabase/migrations/0006_field_ops.sql.
 */
import type {
  Project,
  ProjectRecurringItem,
  ProjectStatus,
  ProjectTask,
  TaskItemStatus,
  VisitStatus,
} from '@/domain/models/ops';
import type { Recurrence } from '@/domain/job/recurrence';

// ---------------------------------------------------------------------------
// State machines (§27)
// ---------------------------------------------------------------------------

const VISIT_NEXT: Record<VisitStatus, VisitStatus[]> = {
  planned: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
};

export function canMoveVisit(from: VisitStatus, to: VisitStatus): boolean {
  return VISIT_NEXT[from].includes(to);
}

const TASK_NEXT: Record<TaskItemStatus, TaskItemStatus[]> = {
  open: ['completed', 'needs_follow_up'],
  needs_follow_up: ['completed'],
  completed: [],
};

export function canMoveTask(from: TaskItemStatus, to: TaskItemStatus): boolean {
  return from === to || TASK_NEXT[from].includes(to);
}

/** Terminal project states cannot change; the rest move freely between each other. */
export function canMoveProject(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === to) return true;
  return from !== 'completed' && from !== 'closed';
}

export function isTaskOpen(t: Pick<ProjectTask, 'status'>): boolean {
  return t.status !== 'completed';
}

/**
 * A project can be completed/closed only when no task is open or waiting on
 * follow-up (§31). Override is §36 Q3 and not offered.
 */
export function projectCloseBlockers(
  project: Pick<Project, 'id'>,
  tasks: Pick<ProjectTask, 'id' | 'projectId' | 'status'>[],
): string[] {
  return tasks.filter((t) => t.projectId === project.id && isTaskOpen(t)).map((t) => t.id);
}

// ---------------------------------------------------------------------------
// Visit contents and completion
// ---------------------------------------------------------------------------

/**
 * Tasks the supervisor sees on a visit: everything on the project not yet
 * completed (carried follow-ups included, BR-006), plus whatever was completed
 * during this visit so the report shows it.
 */
export function tasksForVisit<T extends Pick<ProjectTask, 'projectId' | 'status' | 'completedInVisitId'>>(
  projectId: string,
  visitId: string,
  tasks: T[],
): T[] {
  return tasks.filter(
    (t) => t.projectId === projectId && (isTaskOpen(t) || t.completedInVisitId === visitId),
  );
}

export interface CompletionCheck {
  /** Tasks still OPEN — the supervisor must mark each done or follow-up. */
  undecided: string[];
  /** Tasks completed without the photo their configuration requires (BR-012). */
  missingPhotos: string[];
  /** No crew recorded on the visit. */
  noCrew: boolean;
}

/**
 * What stops a visit from being completed (§5 step 7). NEEDS_FOLLOW_UP never
 * blocks and is never closed by completing the visit (BR-005).
 */
export function visitCompletionCheck(
  visitTasks: Pick<ProjectTask, 'id' | 'status' | 'photoRequired'>[],
  photoTaskIds: Set<string>,
  crewCount: number,
): CompletionCheck {
  return {
    undecided: visitTasks.filter((t) => t.status === 'open').map((t) => t.id),
    missingPhotos: visitTasks
      .filter((t) => t.status === 'completed' && t.photoRequired && !photoTaskIds.has(t.id))
      .map((t) => t.id),
    noCrew: crewCount === 0,
  };
}

export function canCompleteVisit(c: CompletionCheck): boolean {
  return c.undecided.length === 0 && c.missingPhotos.length === 0 && !c.noCrew;
}

// ---------------------------------------------------------------------------
// Recurring maintenance (BR-011, §8, TC-06)
// ---------------------------------------------------------------------------

const MONTHS: Record<Exclude<Recurrence, 'none' | 'weekly'>, number> = { monthly: 1, quarterly: 3, biannual: 6 };

/**
 * Next due date for a YYYY-MM-DD date. Month steps clamp to the month's last
 * day (Jan 31 + 1 month = Feb 28), matching Postgres `date + interval`.
 */
export function nextDueDate(from: string, recurrence: Exclude<Recurrence, 'none'>): string {
  const [y, m, d] = from.split('-').map(Number);
  if (recurrence === 'weekly') {
    return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  }
  const target = new Date(Date.UTC(y, m - 1 + MONTHS[recurrence], 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Items due (or overdue) on a date. Missed items stay due; nothing auto-completes. */
export function dueRecurringItems<R extends Pick<ProjectRecurringItem, 'projectId' | 'nextDueOn' | 'active'>>(
  projectId: string,
  onDate: string,
  items: R[],
): R[] {
  return items.filter((r) => r.projectId === projectId && r.active && r.nextDueOn <= onDate);
}

export function isOverdue(item: Pick<ProjectRecurringItem, 'nextDueOn'>, today: string): boolean {
  return item.nextDueOn < today;
}

/** Last/next dates after the item's task is actually completed on `doneOn`. */
export function rollRecurringItem<R extends Pick<ProjectRecurringItem, 'recurrence'>>(
  item: R,
  doneOn: string,
): R & { lastDoneOn: string; nextDueOn: string } {
  return { ...item, lastDoneOn: doneOn, nextDueOn: nextDueDate(doneOn, item.recurrence) };
}

import type { FieldTask, FieldTaskStatus, Role, TaskProof } from '../models/ops';

export type TaskAction = 'start' | 'submit' | 'approve' | 'reject' | 'reopen';

interface Transition {
  from: FieldTaskStatus;
  to: FieldTaskStatus;
  roles: Role[];
  action: TaskAction;
}

const TRANSITIONS: Transition[] = [
  { from: 'not_started', to: 'in_progress', roles: ['worker', 'manager'], action: 'start' },
  { from: 'in_progress', to: 'submitted',   roles: ['worker', 'manager'], action: 'submit' },
  { from: 'submitted',   to: 'approved',    roles: ['manager'],           action: 'approve' },
  { from: 'submitted',   to: 'rejected',    roles: ['manager'],           action: 'reject' },
  { from: 'rejected',    to: 'in_progress', roles: ['worker', 'manager'], action: 'reopen' },
];

export function canTransition(
  from: FieldTaskStatus,
  action: TaskAction,
  role: Role,
): FieldTaskStatus | null {
  const t = TRANSITIONS.find((x) => x.from === from && x.action === action);
  if (!t) return null;
  if (!t.roles.includes(role)) return null;
  return t.to;
}

export function availableActions(status: FieldTaskStatus, role: Role): TaskAction[] {
  return TRANSITIONS.filter((t) => t.from === status && t.roles.includes(role)).map(
    (t) => t.action,
  );
}

/** Minutes spent on a task. Uses started_at/finished_at, falls back to "now" when running. */
export function timeOnTaskMinutes(task: Pick<FieldTask, 'startedAt' | 'finishedAt' | 'status'>): number {
  if (!task.startedAt) return 0;
  const start = new Date(task.startedAt).getTime();
  const end = task.finishedAt ? new Date(task.finishedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 60000));
}

export interface DailySummary {
  workerId: string;
  date: string;          // YYYY-MM-DD
  taskCount: number;
  completedCount: number;
  totalMinutes: number;
}

export function dailySummary(
  workerId: string,
  date: string,
  tasks: FieldTask[],
): DailySummary {
  const day = tasks.filter((t) => {
    if (t.assignedWorkerId !== workerId) return false;
    return t.scheduledAt.slice(0, 10) === date;
  });
  const completed = day.filter((t) => t.status === 'submitted' || t.status === 'approved');
  const totalMinutes = day.reduce((sum, t) => sum + timeOnTaskMinutes(t), 0);
  return {
    workerId,
    date,
    taskCount: day.length,
    completedCount: completed.length,
    totalMinutes,
  };
}

export interface ProofRequirements {
  needsStartProof: boolean;
  needsFinishProof: boolean;
}

export function proofRequirements(
  status: FieldTaskStatus,
  proofs: TaskProof[],
): ProofRequirements {
  const hasStart = proofs.some((p) => p.kind === 'start');
  const hasFinish = proofs.some((p) => p.kind === 'finish');
  return {
    needsStartProof: status === 'not_started' && !hasStart,
    needsFinishProof: status === 'in_progress' && !hasFinish,
  };
}

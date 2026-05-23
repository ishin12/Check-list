import { newId } from '@/lib/id';
import { nowIso } from '@/lib/datetime';
import { normalizeTaskOrder } from '@/domain/template/template';
import type {
  Customer,
  Job,
  Language,
  Signature,
  TaskResult,
  Template,
} from '@/domain/models/types';

export function startJob(template: Template, language: Language): Job {
  const snapshot: Template = {
    ...template,
    tasks: normalizeTaskOrder(template.tasks),
  };
  return {
    id: newId(),
    templateId: template.id,
    templateSnapshot: snapshot,
    customer: {},
    results: snapshot.tasks.map((task) => ({ taskId: task.id, checked: false })),
    language,
    status: 'draft',
    createdAt: nowIso(),
  };
}

export function setTaskChecked(job: Job, taskId: string, checked: boolean): Job {
  return {
    ...job,
    results: job.results.map((result) =>
      result.taskId === taskId ? { ...result, checked } : result,
    ),
  };
}

export function setTaskNote(job: Job, taskId: string, note: string): Job {
  return {
    ...job,
    results: job.results.map((result) =>
      result.taskId === taskId ? { ...result, note } : result,
    ),
  };
}

export function setCustomer(job: Job, customer: Customer): Job {
  return { ...job, customer: { ...job.customer, ...customer } };
}

export function setSignature(job: Job, signature: Signature | undefined): Job {
  return { ...job, signature };
}

export function completeJob(job: Job): Job {
  return { ...job, status: 'completed', completedAt: nowIso() };
}

export function countChecked(results: TaskResult[]): number {
  return results.filter((result) => result.checked).length;
}

/** All tasks marked required in the snapshot must be checked. */
export function requiredTasksDone(job: Job): boolean {
  const requiredIds = new Set(
    job.templateSnapshot.tasks.filter((task) => task.required).map((task) => task.id),
  );
  if (requiredIds.size === 0) return true;
  return job.results
    .filter((result) => requiredIds.has(result.taskId))
    .every((result) => result.checked);
}

export function canCompleteJob(job: Job): boolean {
  return requiredTasksDone(job) && !!job.signature;
}

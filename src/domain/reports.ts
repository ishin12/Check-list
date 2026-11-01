import type { FieldTask, FieldTaskStatus } from './models/ops';

export interface ReportSummary {
  total: number;
  approved: number;
  pending: number;
  completionRate: number;
}

export function summarizeTasks(tasks: Pick<FieldTask, 'status'>[]): ReportSummary {
  const approved = tasks.filter((task) => task.status === 'approved').length;
  return {
    total: tasks.length,
    approved,
    pending: tasks.length - approved,
    completionRate: tasks.length === 0 ? 0 : Math.round((approved / tasks.length) * 100),
  };
}

export function reportCsv(tasks: Pick<FieldTask, 'id' | 'title' | 'clientId' | 'status' | 'scheduledAt'>[]): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = tasks.map((task) => [task.id, task.title, task.clientId, task.status, task.scheduledAt].map(quote).join(','));
  return ['id,title,client_id,status,scheduled_at', ...rows].join('\n');
}

export const REPORT_STATUSES: readonly FieldTaskStatus[] = [
  'not_started', 'in_progress', 'submitted', 'approved', 'rejected',
];

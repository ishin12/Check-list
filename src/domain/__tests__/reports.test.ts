import { describe, expect, it } from 'vitest';
import {
  laborMatrix,
  openWorkReport,
  projectReport,
  unallocatedByWorker,
  unallocatedReport,
  workerReport,
} from '@/domain/reports/reports';
import type { LaborAllocation, ProjectRecurringItem, ProjectTask } from '@/domain/models/ops';

const a = (employeeId: string, projectId: string, workDate: string, duration: 0.5 | 1, voidedAt?: string): LaborAllocation =>
  ({ id: `${employeeId}${projectId}${workDate}`, employeeId, projectId, workDate, duration, supervisorId: 's', voidedAt });

const allocations = [
  a('e1', 'A', '2026-09-01', 1),
  a('e1', 'A', '2026-09-02', 0.5),
  a('e1', 'B', '2026-09-02', 0.5),
  a('e2', 'A', '2026-09-01', 1),
  a('e2', 'B', '2026-09-03', 1, 'voided'),
  a('e3', 'B', '2026-10-01', 1),
];

describe('labor reports (§14, §21)', () => {
  it('worker report: days per worker and where', () => {
    const r = workerReport(allocations, '2026-09-01', '2026-09-30');
    expect(r.map((x) => [x.employeeId, x.days])).toEqual([['e1', 2], ['e2', 1]]);
    expect(r[0].byProject).toEqual([{ projectId: 'A', days: 1.5 }, { projectId: 'B', days: 0.5 }]);
  });

  it('project report: workers and days per worker; voided rows excluded', () => {
    const r = projectReport(allocations, '2026-09-01', '2026-09-30');
    expect(r.map((x) => [x.projectId, x.days])).toEqual([['A', 2.5], ['B', 0.5]]);
    expect(r[0].byWorker).toEqual([{ employeeId: 'e1', days: 1.5 }, { employeeId: 'e2', days: 1 }]);
  });

  it('monthly matrix totals match', () => {
    const m = laborMatrix(allocations, '2026-09-01', '2026-09-30');
    expect(m.cells.get('e1|A')).toBe(1.5);
    expect(m.rowTotals.get('e1')).toBe(2);
    expect(m.colTotals.get('B')).toBe(0.5);
    expect(m.total).toBe(3);
  });

  it('TC-11 unallocated workers on working days only', () => {
    const employees = [{ id: 'e1', status: 'active' }, { id: 'e2', status: 'active' }, { id: 'e9', status: 'inactive' }] as const;
    // 2026-09-04 is a Friday (day off when work days are Sat–Thu).
    const weekdayOf = (d: string) => new Date(`${d}T12:00:00`).getDay();
    const days = unallocatedReport([...employees], allocations, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'], [0, 1, 2, 3, 4, 6], weekdayOf);
    expect(days.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(days[0].items).toEqual([]);
    expect(days[1].items).toEqual([{ employeeId: 'e2', free: 1 }]);
    expect(days[2].items).toEqual([{ employeeId: 'e1', free: 1 }, { employeeId: 'e2', free: 1 }]);
    expect(unallocatedByWorker(days)).toEqual([{ employeeId: 'e2', freeDays: 2 }, { employeeId: 'e1', freeDays: 1 }]);
  });

  it('D-18 / L8 counts a worker only from joining until being switched off', () => {
    const weekdayOf = (d: string) => new Date(`${d}T12:00:00`).getDay();
    const staff = [
      { id: 'new', status: 'active' as const, createdAt: '2026-09-02T08:00:00Z' },
      { id: 'left', status: 'inactive' as const, createdAt: '2026-01-01T08:00:00Z', updatedAt: '2026-09-02T08:00:00Z' },
    ];
    const days = unallocatedReport(staff, [], ['2026-09-01', '2026-09-02', '2026-09-03'], [0, 1, 2, 3, 4, 6], weekdayOf);
    expect(days.map((d) => d.items.map((x) => x.employeeId))).toEqual([['left'], ['new'], ['new']]);
  });
});

describe('open work report', () => {
  it('splits follow-up, open and overdue periodic items', () => {
    const t = (id: string, status: ProjectTask['status']) => ({ id, status }) as ProjectTask;
    const r = (id: string, nextDueOn: string, active = true) => ({ id, nextDueOn, active }) as ProjectRecurringItem;
    const out = openWorkReport([t('1', 'open'), t('2', 'needs_follow_up'), t('3', 'completed')],
      [r('a', '2026-09-01'), r('b', '2026-09-10'), r('c', '2026-09-01', false)], '2026-09-10');
    expect(out.followUp.map((x) => x.id)).toEqual(['2']);
    expect(out.open.map((x) => x.id)).toEqual(['1']);
    expect(out.overduePeriodic.map((x) => x.id)).toEqual(['a']);
    expect(out.duePeriodic.map((x) => x.id)).toEqual(['b']);
  });
});

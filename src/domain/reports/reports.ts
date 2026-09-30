/**
 * Management and finance reports (§14). All figures are derived from the
 * source records at read time (§24); nothing here is stored.
 */
import type { Employee, LaborAllocation, ProjectRecurringItem, ProjectTask } from '@/domain/models/ops';

type Alloc = Pick<LaborAllocation, 'employeeId' | 'projectId' | 'workDate' | 'duration' | 'voidedAt'>;

const live = <A extends Alloc>(list: A[], from: string, to: string) =>
  list.filter((a) => !a.voidedAt && a.workDate >= from && a.workDate <= to);

const sum = (list: { duration: number }[]) => list.reduce((s, a) => s + Number(a.duration), 0);

export interface WorkerRow {
  employeeId: string;
  days: number;
  byProject: { projectId: string; days: number }[];
}

/** Worker report: where each worker worked and for how many days (§14, §21). */
export function workerReport(allocations: Alloc[], from: string, to: string): WorkerRow[] {
  const rows = new Map<string, Map<string, number>>();
  for (const a of live(allocations, from, to)) {
    const m = rows.get(a.employeeId) ?? new Map<string, number>();
    m.set(a.projectId, (m.get(a.projectId) ?? 0) + Number(a.duration));
    rows.set(a.employeeId, m);
  }
  return [...rows].map(([employeeId, m]) => ({
    employeeId,
    days: [...m.values()].reduce((s, d) => s + d, 0),
    byProject: [...m].map(([projectId, days]) => ({ projectId, days })).sort((x, y) => y.days - x.days),
  })).sort((x, y) => y.days - x.days);
}

export interface ProjectRow {
  projectId: string;
  days: number;
  byWorker: { employeeId: string; days: number }[];
}

/** Project report: which workers worked on it and days per worker (§14). */
export function projectReport(allocations: Alloc[], from: string, to: string): ProjectRow[] {
  const rows = new Map<string, Map<string, number>>();
  for (const a of live(allocations, from, to)) {
    const m = rows.get(a.projectId) ?? new Map<string, number>();
    m.set(a.employeeId, (m.get(a.employeeId) ?? 0) + Number(a.duration));
    rows.set(a.projectId, m);
  }
  return [...rows].map(([projectId, m]) => ({
    projectId,
    days: [...m.values()].reduce((s, d) => s + d, 0),
    byWorker: [...m].map(([employeeId, days]) => ({ employeeId, days })).sort((x, y) => y.days - x.days),
  })).sort((x, y) => y.days - x.days);
}

export interface Matrix {
  employeeIds: string[];
  projectIds: string[];
  /** cell(employeeId, projectId) → days */
  cells: Map<string, number>;
  rowTotals: Map<string, number>;
  colTotals: Map<string, number>;
  total: number;
}

/** Monthly labor distribution: workers × projects (§14). */
export function laborMatrix(allocations: Alloc[], from: string, to: string): Matrix {
  const rows = live(allocations, from, to);
  const cells = new Map<string, number>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  for (const a of rows) {
    const d = Number(a.duration);
    const k = `${a.employeeId}|${a.projectId}`;
    cells.set(k, (cells.get(k) ?? 0) + d);
    rowTotals.set(a.employeeId, (rowTotals.get(a.employeeId) ?? 0) + d);
    colTotals.set(a.projectId, (colTotals.get(a.projectId) ?? 0) + d);
  }
  return {
    employeeIds: [...rowTotals.keys()],
    projectIds: [...colTotals.keys()],
    cells, rowTotals, colTotals, total: sum(rows),
  };
}

export interface UnallocatedDay {
  date: string;
  items: { employeeId: string; free: number }[];
}

/**
 * Unallocated workers per working day (§6, §14, TC-11). Only active workers,
 * only configured working days. A half-booked worker shows 0.5 free.
 */
export function unallocatedReport(
  employees: (Pick<Employee, 'id' | 'status'> & Partial<Pick<Employee, 'createdAt' | 'updatedAt'>>)[],
  allocations: Alloc[],
  days: string[],
  workDays: number[],
  weekdayOf: (date: string) => number,
  /** Calendar date of a timestamp (Riyadh); defaults to its first 10 characters. */
  dayOf: (iso: string) => string = (iso) => iso.slice(0, 10),
): UnallocatedDay[] {
  const load = new Map<string, number>();
  for (const a of allocations) {
    if (a.voidedAt) continue;
    const k = `${a.employeeId}|${a.workDate}`;
    load.set(k, (load.get(k) ?? 0) + Number(a.duration));
  }
  // An inactive worker still counts on the days before they were switched off,
  // so a past month does not change when someone leaves (UAT L8).
  const active = employees.filter((e) => e.status === 'active' || !!e.updatedAt);
  const workedOn = (e: (typeof employees)[number], date: string) =>
    e.status === 'active' || (!!e.updatedAt && date < dayOf(e.updatedAt));
  return days
    .filter((d) => workDays.includes(weekdayOf(d)))
    .map((date) => ({
      date,
      items: active
        // A worker is not unallocated before they were added (UAT D-18).
        .filter((e) => (!e.createdAt || dayOf(e.createdAt) <= date) && workedOn(e, date))
        .map((e) => ({ employeeId: e.id, free: Math.max(0, 1 - (load.get(`${e.id}|${date}`) ?? 0)) }))
        .filter((x) => x.free > 0),
    }));
}

/** Unallocated days per worker over the period (free capacity summed). */
export function unallocatedByWorker(days: UnallocatedDay[]): { employeeId: string; freeDays: number }[] {
  const m = new Map<string, number>();
  for (const d of days) for (const x of d.items) m.set(x.employeeId, (m.get(x.employeeId) ?? 0) + x.free);
  return [...m].map(([employeeId, freeDays]) => ({ employeeId, freeDays })).sort((a, b) => b.freeDays - a.freeDays);
}

export interface OpenWork {
  followUp: ProjectTask[];
  open: ProjectTask[];
  overduePeriodic: ProjectRecurringItem[];
  duePeriodic: ProjectRecurringItem[];
}

/** Open, follow-up and overdue work (§14). */
export function openWorkReport(tasks: ProjectTask[], recurring: ProjectRecurringItem[], today: string): OpenWork {
  const activeItems = recurring.filter((r) => r.active);
  return {
    followUp: tasks.filter((t) => t.status === 'needs_follow_up'),
    open: tasks.filter((t) => t.status === 'open'),
    overduePeriodic: activeItems.filter((r) => r.nextDueOn < today),
    duePeriodic: activeItems.filter((r) => r.nextDueOn === today),
  };
}

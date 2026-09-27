/**
 * Labor allocation rules (Master Spec §6, BR-001..004, BR-009/010).
 *
 * The database enforces the same rules (0006_field_ops.sql,
 * labor_allocations_guard) under a lock; these functions let the UI explain
 * a rejection before saving and let the demo backend behave the same way.
 */
import type { LaborAllocation, LaborDuration, MonthClose } from '@/domain/models/ops';

export const DAY_CAPACITY = 1;
export const LABOR_DURATIONS: readonly LaborDuration[] = [1, 0.5];

export type LaborRuleError =
  | { code: 'BR-002'; duration: number }
  | { code: 'BR-001'; employeeId: string; workDate: string; existing: number; requested: number }
  | { code: 'BR-009'; month: string }
  | { code: 'BR-010'; month: string }
  | { code: 'DUPLICATE_IN_VISIT'; employeeId: string; visitId: string };

type Allocation = Pick<LaborAllocation, 'id' | 'employeeId' | 'workDate' | 'duration' | 'visitId' | 'voidedAt'>;

export function isValidDuration(d: number): d is LaborDuration {
  return d === 0.5 || d === 1;
}

/** First day of the month for a YYYY-MM-DD date. */
export function monthOf(workDate: string): string {
  return `${workDate.slice(0, 7)}-01`;
}

export function isMonthClosed(workDate: string, closes: Pick<MonthClose, 'month'>[]): boolean {
  const m = monthOf(workDate);
  return closes.some((c) => c.month.slice(0, 10) === m);
}

/** Total non-voided days already loaded on an employee for a date. */
export function dayLoad(
  employeeId: string,
  workDate: string,
  allocations: Allocation[],
  excludeId?: string,
): number {
  return allocations
    .filter((a) => a.employeeId === employeeId && a.workDate === workDate && !a.voidedAt && a.id !== excludeId)
    .reduce((sum, a) => sum + Number(a.duration), 0);
}

/** Days still free for an employee on a date (0, 0.5 or 1). */
export function remainingCapacity(employeeId: string, workDate: string, allocations: Allocation[]): number {
  return Math.max(0, DAY_CAPACITY - dayLoad(employeeId, workDate, allocations));
}

export interface AllocationWriter {
  /** Holds finance (role or granted); may change closed months with a reason. */
  hasFinance: boolean;
}

/**
 * Checks one new or changed allocation against the existing ones.
 * Returns null when it can be saved.
 */
export function checkAllocation(
  candidate: Allocation & { changeReason?: string },
  existing: Allocation[],
  closes: Pick<MonthClose, 'month'>[],
  writer: AllocationWriter,
  previous?: Allocation & { changeReason?: string },
): LaborRuleError | null {
  const touchesClosed =
    isMonthClosed(candidate.workDate, closes) || (previous ? isMonthClosed(previous.workDate, closes) : false);
  if (touchesClosed) {
    const month = monthOf(previous?.workDate ?? candidate.workDate);
    if (!writer.hasFinance) return { code: 'BR-009', month };
    const reason = candidate.changeReason?.trim() ?? '';
    if (!reason || (previous && reason === (previous.changeReason ?? '').trim())) {
      return { code: 'BR-010', month };
    }
  }

  if (candidate.voidedAt) return null;

  if (!isValidDuration(Number(candidate.duration))) {
    return { code: 'BR-002', duration: Number(candidate.duration) };
  }

  if (candidate.visitId) {
    const dup = existing.some(
      (a) => a.visitId === candidate.visitId && a.employeeId === candidate.employeeId && !a.voidedAt && a.id !== candidate.id,
    );
    if (dup) return { code: 'DUPLICATE_IN_VISIT', employeeId: candidate.employeeId, visitId: candidate.visitId };
  }

  const load = dayLoad(candidate.employeeId, candidate.workDate, existing, candidate.id);
  if (load + Number(candidate.duration) > DAY_CAPACITY) {
    return {
      code: 'BR-001',
      employeeId: candidate.employeeId,
      workDate: candidate.workDate,
      existing: load,
      requested: Number(candidate.duration),
    };
  }
  return null;
}

export interface CrewPick {
  employeeId: string;
  duration: LaborDuration;
}

export interface CrewAllocationInput {
  workDate: string;
  projectId: string;
  visitId?: string;
  supervisorId: string;
  crew: CrewPick[];
}

/**
 * Turns a multi-select crew pick into one record per worker (BR-004) and
 * checks them together, so the same worker picked twice is also caught.
 * All-or-nothing: returns the errors, or the rows to insert.
 */
export function buildCrewAllocations(
  input: CrewAllocationInput,
  existing: Allocation[],
  closes: Pick<MonthClose, 'month'>[],
  writer: AllocationWriter,
  newId: () => string,
): { rows: Omit<LaborAllocation, 'notes' | 'changeReason' | 'voidedAt' | 'voidReason'>[]; errors: LaborRuleError[] } {
  const rows: Omit<LaborAllocation, 'notes' | 'changeReason' | 'voidedAt' | 'voidReason'>[] = [];
  const errors: LaborRuleError[] = [];
  const pending: Allocation[] = [...existing];
  for (const pick of input.crew) {
    const row = {
      id: newId(),
      workDate: input.workDate,
      employeeId: pick.employeeId,
      projectId: input.projectId,
      visitId: input.visitId,
      duration: pick.duration,
      supervisorId: input.supervisorId,
    };
    const err = checkAllocation(row, pending, closes, writer);
    if (err) {
      errors.push(err);
      continue;
    }
    rows.push(row);
    pending.push(row);
  }
  return errors.length ? { rows: [], errors } : { rows, errors };
}

/**
 * Active employees with less than a full day on a date (TC-11). A worker on
 * half a day is listed with the half still free.
 */
export function unallocatedEmployees<E extends { id: string; status: string }>(
  workDate: string,
  employees: E[],
  allocations: Allocation[],
): { employee: E; free: number }[] {
  return employees
    .filter((e) => e.status === 'active')
    .map((employee) => ({ employee, free: remainingCapacity(employee.id, workDate, allocations) }))
    .filter((x) => x.free > 0);
}

/**
 * Crew of the most recent earlier visit/day on a project, for "copy
 * yesterday's crew". Durations are kept; the caller re-checks capacity.
 */
export function previousCrew(
  projectId: string,
  beforeDate: string,
  allocations: (Allocation & { projectId: string })[],
): CrewPick[] {
  const earlier = allocations.filter((a) => a.projectId === projectId && a.workDate < beforeDate && !a.voidedAt);
  if (earlier.length === 0) return [];
  const lastDate = earlier.reduce((max, a) => (a.workDate > max ? a.workDate : max), earlier[0].workDate);
  return earlier
    .filter((a) => a.workDate === lastDate)
    .map((a) => ({ employeeId: a.employeeId, duration: Number(a.duration) as LaborDuration }));
}

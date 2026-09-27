import { describe, expect, it } from 'vitest';
import {
  buildCrewAllocations,
  checkAllocation,
  dayLoad,
  monthOf,
  previousCrew,
  unallocatedEmployees,
} from '@/domain/labor/allocation';
import type { LaborAllocation } from '@/domain/models/ops';

let seq = 0;
const newId = () => `id-${++seq}`;

function alloc(p: Partial<LaborAllocation> & Pick<LaborAllocation, 'employeeId' | 'duration'>): LaborAllocation {
  return {
    id: newId(),
    workDate: '2026-09-01',
    projectId: 'A',
    supervisorId: 'sup',
    ...p,
  };
}

const supervisor = { hasFinance: false };
const finance = { hasFinance: true };

describe('labor allocation rules', () => {
  it('TC-01 rejects 0.5 on B when already 1.0 on A', () => {
    const existing = [alloc({ employeeId: 'e1', duration: 1 })];
    const err = checkAllocation(alloc({ employeeId: 'e1', duration: 0.5, projectId: 'B' }), existing, [], supervisor);
    expect(err).toMatchObject({ code: 'BR-001', existing: 1, requested: 0.5 });
  });

  it('TC-02 accepts 0.5 + 0.5 on two projects', () => {
    const existing = [alloc({ employeeId: 'e1', duration: 0.5 })];
    expect(checkAllocation(alloc({ employeeId: 'e1', duration: 0.5, projectId: 'B' }), existing, [], supervisor)).toBeNull();
    expect(dayLoad('e1', '2026-09-01', [...existing, alloc({ employeeId: 'e1', duration: 0.5 })])).toBe(1);
  });

  it('BR-002 only full or half day', () => {
    const err = checkAllocation(alloc({ employeeId: 'e1', duration: 0.7 as 1 }), [], [], supervisor);
    expect(err).toMatchObject({ code: 'BR-002' });
  });

  it('voided rows do not count toward the day', () => {
    const existing = [alloc({ employeeId: 'e1', duration: 1, voidedAt: '2026-09-01T10:00:00Z', voidReason: 'wrong' })];
    expect(checkAllocation(alloc({ employeeId: 'e1', duration: 1 }), existing, [], supervisor)).toBeNull();
  });

  it('editing a row does not count the row against itself', () => {
    const row = alloc({ employeeId: 'e1', duration: 0.5 });
    expect(checkAllocation({ ...row, duration: 1 }, [row], [], supervisor, row)).toBeNull();
  });

  it('TC-03 eight workers at once become eight records', () => {
    const crew = Array.from({ length: 8 }, (_, i) => ({ employeeId: `e${i}`, duration: 1 as const }));
    const { rows, errors } = buildCrewAllocations(
      { workDate: '2026-09-03', projectId: 'A', visitId: 'v1', supervisorId: 'sup', crew }, [], [], supervisor, newId,
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.employeeId)).size).toBe(8);
  });

  it('crew save is all-or-nothing when one worker is already full', () => {
    const existing = [alloc({ employeeId: 'e2', duration: 1, workDate: '2026-09-03', projectId: 'B' })];
    const { rows, errors } = buildCrewAllocations(
      { workDate: '2026-09-03', projectId: 'A', supervisorId: 'sup',
        crew: [{ employeeId: 'e1', duration: 1 }, { employeeId: 'e2', duration: 0.5 }] },
      existing, [], supervisor, newId,
    );
    expect(rows).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ code: 'BR-001', employeeId: 'e2' })]);
  });

  it('the same worker picked twice in one visit is caught', () => {
    const { errors } = buildCrewAllocations(
      { workDate: '2026-09-03', projectId: 'A', visitId: 'v1', supervisorId: 'sup',
        crew: [{ employeeId: 'e1', duration: 0.5 }, { employeeId: 'e1', duration: 0.5 }] },
      [], [], supervisor, newId,
    );
    expect(errors).toEqual([expect.objectContaining({ code: 'DUPLICATE_IN_VISIT' })]);
  });
});

describe('month close', () => {
  const closes = [{ month: '2026-09-01' }];

  it('monthOf returns the first day', () => {
    expect(monthOf('2026-09-17')).toBe('2026-09-01');
  });

  it('TC-07 supervisor cannot change a closed month', () => {
    const row = alloc({ employeeId: 'e1', duration: 1 });
    expect(checkAllocation({ ...row, duration: 0.5 }, [row], closes, supervisor, row)).toMatchObject({ code: 'BR-009' });
    expect(checkAllocation(alloc({ employeeId: 'e2', duration: 1 }), [], closes, supervisor)).toMatchObject({ code: 'BR-009' });
  });

  it('TC-08 finance can change a closed month with a reason', () => {
    const row = alloc({ employeeId: 'e1', duration: 1 });
    expect(checkAllocation({ ...row, duration: 0.5 }, [row], closes, finance, row)).toMatchObject({ code: 'BR-010' });
    expect(checkAllocation({ ...row, duration: 0.5, changeReason: 'left at noon' }, [row], closes, finance, row)).toBeNull();
  });

  it('moving a row out of a closed month is still a closed-month change', () => {
    const row = alloc({ employeeId: 'e1', duration: 1 });
    expect(checkAllocation({ ...row, workDate: '2026-10-01' }, [row], closes, supervisor, row)).toMatchObject({ code: 'BR-009' });
  });

  it('open months are unaffected', () => {
    expect(checkAllocation(alloc({ employeeId: 'e1', duration: 1, workDate: '2026-10-02' }), [], closes, supervisor)).toBeNull();
  });
});

describe('unallocated and copy crew', () => {
  const employees = [
    { id: 'e1', status: 'active' },
    { id: 'e2', status: 'active' },
    { id: 'e3', status: 'active' },
    { id: 'e4', status: 'inactive' },
  ];

  it('TC-11 lists active workers with free time', () => {
    const allocations = [
      alloc({ employeeId: 'e1', duration: 1 }),
      alloc({ employeeId: 'e2', duration: 0.5 }),
    ];
    const list = unallocatedEmployees('2026-09-01', employees, allocations);
    expect(list.map((x) => [x.employee.id, x.free])).toEqual([['e2', 0.5], ['e3', 1]]);
  });

  it('copies the crew of the latest earlier day on the project', () => {
    const allocations = [
      alloc({ employeeId: 'e1', duration: 1, workDate: '2026-09-01' }),
      alloc({ employeeId: 'e2', duration: 0.5, workDate: '2026-09-02' }),
      alloc({ employeeId: 'e3', duration: 1, workDate: '2026-09-02' }),
      alloc({ employeeId: 'e1', duration: 1, workDate: '2026-09-02', projectId: 'B' }),
      alloc({ employeeId: 'e1', duration: 1, workDate: '2026-09-03' }),
    ];
    expect(previousCrew('A', '2026-09-03', allocations)).toEqual([
      { employeeId: 'e2', duration: 0.5 },
      { employeeId: 'e3', duration: 1 },
    ]);
    expect(previousCrew('A', '2026-09-01', allocations)).toEqual([]);
  });
});

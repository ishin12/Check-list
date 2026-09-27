import { describe, expect, it } from 'vitest';
import {
  canCompleteVisit,
  canMoveProject,
  canMoveTask,
  canMoveVisit,
  dueRecurringItems,
  isOverdue,
  nextDueDate,
  projectCloseBlockers,
  rollRecurringItem,
  skippedOptionalItems,
  tasksForVisit,
  visitCompletionCheck,
} from '@/domain/fieldops/fieldOps';
import { can, hasFinance } from '@/domain/auth/permissions';
import type { ProjectTask } from '@/domain/models/ops';

function task(p: Partial<ProjectTask> & Pick<ProjectTask, 'id' | 'status'>): ProjectTask {
  return { projectId: 'P1', source: 'manual', description: p.id, photoRequired: false, required: true, createdAt: '2026-09-01', ...p };
}

describe('state machines (§27)', () => {
  it('visits go planned -> in_progress -> completed only', () => {
    expect(canMoveVisit('planned', 'in_progress')).toBe(true);
    expect(canMoveVisit('in_progress', 'completed')).toBe(true);
    expect(canMoveVisit('planned', 'completed')).toBe(false);
    expect(canMoveVisit('completed', 'in_progress')).toBe(false);
  });

  it('tasks: open -> completed | follow-up -> completed, never back', () => {
    expect(canMoveTask('open', 'needs_follow_up')).toBe(true);
    expect(canMoveTask('needs_follow_up', 'completed')).toBe(true);
    expect(canMoveTask('needs_follow_up', 'open')).toBe(false);
    expect(canMoveTask('completed', 'open')).toBe(false);
  });

  it('completed or closed projects are final', () => {
    expect(canMoveProject('active', 'on_hold')).toBe(true);
    expect(canMoveProject('on_hold', 'active')).toBe(true);
    expect(canMoveProject('completed', 'active')).toBe(false);
    expect(canMoveProject('closed', 'completed')).toBe(false);
  });

  it('a project with open or follow-up tasks cannot close', () => {
    const tasks = [task({ id: 't1', status: 'completed' }), task({ id: 't2', status: 'needs_follow_up' })];
    expect(projectCloseBlockers({ id: 'P1' }, tasks)).toEqual(['t2']);
    expect(projectCloseBlockers({ id: 'P1' }, [tasks[0]])).toEqual([]);
  });
});

describe('visits and follow-up', () => {
  it('TC-04 follow-up stays open after the visit and shows on the next one', () => {
    const tasks = [
      task({ id: 'fertilize', status: 'needs_follow_up', lastVisitId: 'v1' }),
      task({ id: 'prune', status: 'completed', completedInVisitId: 'v1', lastVisitId: 'v1' }),
    ];
    const check = visitCompletionCheck('v1', tasksForVisit('P1', 'v1', tasks), new Set(), 3);
    expect(canCompleteVisit(check)).toBe(true);
    expect(tasksForVisit('P1', 'v2', tasks).map((t) => t.id)).toEqual(['fertilize']);
  });

  it('"not done" is an answer: the task stays open and carries over', () => {
    const tasks = [task({ id: 'weed', status: 'open', lastVisitId: 'v1', note: 'No access' })];
    expect(canCompleteVisit(visitCompletionCheck('v1', tasks, new Set(), 1))).toBe(true);
    expect(tasksForVisit('P1', 'v2', tasks).map((t) => t.id)).toEqual(['weed']);
    // On the next visit it must be answered again.
    expect(visitCompletionCheck('v2', tasks, new Set(), 1).undecided).toEqual(['weed']);
  });

  it('unanswered required items, missing required photos and no crew block completion', () => {
    const tasks = [
      task({ id: 'a', status: 'open' }),
      task({ id: 'b', status: 'completed', photoRequired: true, completedInVisitId: 'v1' }),
      task({ id: 'c', status: 'completed', photoRequired: true, completedInVisitId: 'v1' }),
      task({ id: 'd', status: 'open', required: false }),
    ];
    const check = visitCompletionCheck('v1', tasks, new Set(['c']), 0);
    expect(check).toEqual({ undecided: ['a'], missingPhotos: ['b'], noCrew: true });
    expect(canCompleteVisit(check)).toBe(false);
  });

  it('BR-012 photos are not needed unless configured', () => {
    const check = visitCompletionCheck('v1', [task({ id: 'a', status: 'completed', completedInVisitId: 'v1' })], new Set(), 1);
    expect(canCompleteVisit(check)).toBe(true);
  });

  it('untouched optional checklist items are dropped at completion', () => {
    const tasks = [
      task({ id: 'opt', status: 'open', source: 'checklist', required: false, visitId: 'v1' }),
      task({ id: 'optDone', status: 'open', source: 'checklist', required: false, visitId: 'v1', lastVisitId: 'v1' }),
      task({ id: 'req', status: 'open', source: 'checklist', required: true, visitId: 'v1' }),
      task({ id: 'older', status: 'open', source: 'checklist', required: false, visitId: 'v0' }),
    ];
    expect(skippedOptionalItems('v1', tasks)).toEqual(['opt']);
    // An item with a photo or a note was worked on: keep it.
    expect(skippedOptionalItems('v1', tasks, new Set(['opt']))).toEqual([]);
    expect(skippedOptionalItems('v1', [{ ...tasks[0], note: 'looked fine' }])).toEqual([]);
  });
});

describe('recurring maintenance', () => {
  it('computes next due like Postgres date + interval', () => {
    expect(nextDueDate('2026-10-06', 'weekly')).toBe('2026-10-13');
    expect(nextDueDate('2026-10-06', 'monthly')).toBe('2026-11-06');
    expect(nextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextDueDate('2028-01-31', 'monthly')).toBe('2028-02-29');
    expect(nextDueDate('2026-11-30', 'quarterly')).toBe('2027-02-28');
    expect(nextDueDate('2026-08-31', 'biannual')).toBe('2027-02-28');
    expect(nextDueDate('2026-12-29', 'weekly')).toBe('2027-01-05');
  });

  it('TC-06 due and overdue items show until done', () => {
    const items = [
      { id: 'r1', projectId: 'P1', nextDueOn: '2026-10-05', active: true },
      { id: 'r2', projectId: 'P1', nextDueOn: '2026-10-01', active: true },
      { id: 'r3', projectId: 'P1', nextDueOn: '2026-10-20', active: true },
      { id: 'r4', projectId: 'P1', nextDueOn: '2026-10-01', active: false },
      { id: 'r5', projectId: 'P2', nextDueOn: '2026-10-01', active: true },
    ];
    expect(dueRecurringItems('P1', '2026-10-05', items).map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(isOverdue(items[1], '2026-10-05')).toBe(true);
    expect(isOverdue(items[0], '2026-10-05')).toBe(false);
  });

  it('BR-011 rolls last done and next due from the actual done date', () => {
    expect(rollRecurringItem({ recurrence: 'monthly' as const }, '2026-10-06')).toEqual({
      recurrence: 'monthly', lastDoneOn: '2026-10-06', nextDueOn: '2026-11-06',
    });
  });
});

describe('permissions (§29)', () => {
  const base = { active: true };
  it('finance is its own role and can be granted to a manager', () => {
    expect(hasFinance({ ...base, role: 'finance' })).toBe(true);
    expect(hasFinance({ ...base, role: 'manager' })).toBe(false);
    expect(hasFinance({ ...base, role: 'manager', financeAccess: true })).toBe(true);
    expect(can({ ...base, role: 'manager' }, 'month.close')).toBe(false);
    expect(can({ ...base, role: 'manager', financeAccess: true }, 'month.close')).toBe(true);
  });

  it('supervisors record labor and execute tasks but cannot manage or close', () => {
    for (const role of ['supervisor', 'worker'] as const) {
      const u = { ...base, role };
      expect(can(u, 'labor.record')).toBe(true);
      expect(can(u, 'tasks.execute')).toBe(true);
      expect(can(u, 'projects.manage')).toBe(false);
      expect(can(u, 'month.close')).toBe(false);
      expect(can(u, 'labor.edit_closed')).toBe(false);
    }
  });

  it('finance reviews and exports but does not execute tasks', () => {
    const u = { ...base, role: 'finance' as const };
    expect(can(u, 'export')).toBe(true);
    expect(can(u, 'labor.review')).toBe(true);
    expect(can(u, 'tasks.execute')).toBe(false);
    expect(can(u, 'projects.manage')).toBe(false);
  });

  it('inactive users can do nothing', () => {
    expect(can({ active: false, role: 'manager' }, 'projects.manage')).toBe(false);
  });
});

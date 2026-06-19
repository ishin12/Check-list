import { describe, expect, it } from 'vitest';
import {
  availableActions,
  canTransition,
  dailySummary,
  proofRequirements,
  timeOnTaskMinutes,
} from '@/domain/job/taskFlow';
import type { FieldTask, TaskProof } from '@/domain/models/ops';

function task(partial: Partial<FieldTask>): FieldTask {
  return {
    id: 't',
    title: 'Visit',
    clientId: 'c',
    assignedWorkerId: 'w',
    scheduledAt: '2026-06-19T08:00:00Z',
    status: 'not_started',
    createdAt: '2026-06-18T00:00:00Z',
    updatedAt: '2026-06-18T00:00:00Z',
    results: [],
    recurrence: 'none',
    ...partial,
  };
}

describe('canTransition', () => {
  it('worker can start a not_started task', () => {
    expect(canTransition('not_started', 'start', 'worker')).toBe('in_progress');
  });

  it('worker cannot approve', () => {
    expect(canTransition('submitted', 'approve', 'worker')).toBeNull();
  });

  it('manager can approve a submitted task', () => {
    expect(canTransition('submitted', 'approve', 'manager')).toBe('approved');
  });

  it('manager can reject a submitted task', () => {
    expect(canTransition('submitted', 'reject', 'manager')).toBe('rejected');
  });

  it('client has no transitions', () => {
    expect(canTransition('not_started', 'start', 'client')).toBeNull();
    expect(canTransition('submitted', 'approve', 'client')).toBeNull();
  });

  it('rejected can be reopened', () => {
    expect(canTransition('rejected', 'reopen', 'worker')).toBe('in_progress');
  });
});

describe('availableActions', () => {
  it('lists worker actions on an in-progress task', () => {
    expect(availableActions('in_progress', 'worker')).toEqual(['submit']);
  });

  it('lists manager actions on a submitted task', () => {
    expect(availableActions('submitted', 'manager').sort()).toEqual(['approve', 'reject']);
  });
});

describe('timeOnTaskMinutes', () => {
  it('returns 0 before start', () => {
    expect(timeOnTaskMinutes({ status: 'not_started' })).toBe(0);
  });

  it('computes minutes between start and finish', () => {
    expect(
      timeOnTaskMinutes({
        status: 'submitted',
        startedAt: '2026-06-19T08:00:00Z',
        finishedAt: '2026-06-19T08:45:00Z',
      }),
    ).toBe(45);
  });
});

describe('dailySummary', () => {
  it('groups tasks for a worker on a given day', () => {
    const tasks = [
      task({ id: '1', status: 'approved', startedAt: '2026-06-19T08:00:00Z', finishedAt: '2026-06-19T09:00:00Z' }),
      task({ id: '2', status: 'in_progress', startedAt: '2026-06-19T10:00:00Z' }),
      task({ id: '3', scheduledAt: '2026-06-20T08:00:00Z' }), // other day, excluded
      task({ id: '4', assignedWorkerId: 'other' }),           // other worker, excluded
    ];
    const summary = dailySummary('w', '2026-06-19', tasks);
    expect(summary.taskCount).toBe(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.totalMinutes).toBeGreaterThanOrEqual(60);
  });
});

describe('proofRequirements', () => {
  const proof = (kind: 'start' | 'finish'): TaskProof => ({
    id: kind,
    taskId: 't',
    kind,
    storagePath: 'p',
    mime: 'image/jpeg',
    capturedAt: '2026-06-19T08:00:00Z',
    uploadedAt: '2026-06-19T08:00:00Z',
  });

  it('requires a start proof before starting', () => {
    expect(proofRequirements('not_started', []).needsStartProof).toBe(true);
  });

  it('does not require start proof once captured', () => {
    expect(proofRequirements('not_started', [proof('start')]).needsStartProof).toBe(false);
  });

  it('requires a finish proof while in progress', () => {
    expect(proofRequirements('in_progress', [proof('start')]).needsFinishProof).toBe(true);
  });
});

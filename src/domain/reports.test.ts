import { describe, expect, it } from 'vitest';
import { reportCsv, summarizeTasks } from './reports';

describe('operational reports', () => {
  it('summarizes completion without inventing monetary data', () => {
    expect(summarizeTasks([{ status: 'approved' }, { status: 'submitted' }, { status: 'rejected' }])).toEqual({
      total: 3, approved: 1, pending: 2, completionRate: 33,
    });
  });

  it('escapes CSV values', () => {
    expect(reportCsv([{ id: '1', title: 'A, "B"', clientId: 'c', status: 'approved', scheduledAt: '2026-01-01' }]))
      .toContain('"A, ""B"""');
  });
});

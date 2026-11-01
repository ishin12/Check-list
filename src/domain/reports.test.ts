import { describe, expect, it } from 'vitest';
import { reportCsv, reportExcel, summarizeTasks } from './reports';

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

  it('exports every task in an Excel-compatible table', () => {
    expect(reportExcel([{ id: '1', title: 'Visit', clientId: 'c', status: 'approved', scheduledAt: '2026-01-01' }]))
      .toBe('id\ttitle\tclient_id\tstatus\tscheduled_at\n1\tVisit\tc\tapproved\t2026-01-01');
  });
});

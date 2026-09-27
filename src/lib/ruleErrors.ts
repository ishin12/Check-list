import type { TFunction } from 'i18next';
import { errorText } from './useAsync';

/**
 * Turns a database refusal into a sentence the user can act on. The raw text
 * is kept after the explanation so support can still see what happened.
 */
export function friendlyError(e: unknown, t: TFunction): string {
  const raw = errorText(e);
  const known: [RegExp, string, string][] = [
    [/BR-001/, 'err.br001', 'This worker is already booked for the full day. A worker cannot exceed 1.0 day.'],
    [/duration_full_or_half|BR-002/, 'err.br002', 'Labor must be a full day (1.0) or half day (0.5).'],
    [/labor_one_per_visit/, 'err.duplicateCrew', 'This worker is already on this visit.'],
    [/BR-009/, 'err.br009', 'This month is closed. Only finance can change its labor.'],
    [/BR-010/, 'err.br010', 'Enter a reason to change labor in a closed month.'],
    [/BR-014/, 'err.br014', 'Completed records cannot be deleted. Archive, close or void instead.'],
    [/cannot be closed/, 'err.projectOpenTasks', 'This project still has open or follow-up tasks.'],
    [/cannot move from/, 'err.visitState', 'This visit cannot change to that status.'],
    [/cannot be reopened|cannot go back/, 'err.taskState', 'This task cannot go back to that status.'],
    [/cannot change status/, 'err.projectFinal', 'This project is completed or closed and cannot change status.'],
    [/month_closes_pkey/, 'err.monthAlreadyClosed', 'This month is already closed.'],
    [/row-level security|permission denied/i, 'err.permission', 'You do not have permission to do this.'],
    [/Failed to fetch|NetworkError|network/i, 'err.network', 'Could not reach the server. Nothing was saved — check the connection and try again.'],
  ];
  for (const [rx, key, fallback] of known) {
    if (rx.test(raw)) return `${t(key, fallback)}`;
  }
  return `${t('err.saveFailed', 'Not saved:')} ${raw}`;
}

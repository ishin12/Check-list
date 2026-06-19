export type Recurrence = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'biannual';

export const RECURRENCE_OPTIONS: Recurrence[] = ['none', 'weekly', 'monthly', 'quarterly', 'biannual'];

const LABELS: Record<Recurrence, { i18n: string; fallback: string }> = {
  none:      { i18n: 'recurrence.none',      fallback: 'Does not repeat' },
  weekly:    { i18n: 'recurrence.weekly',    fallback: 'Repeats weekly' },
  monthly:   { i18n: 'recurrence.monthly',   fallback: 'Repeats monthly' },
  quarterly: { i18n: 'recurrence.quarterly', fallback: 'Every 3 months' },
  biannual:  { i18n: 'recurrence.biannual',  fallback: 'Every 6 months' },
};

export function recurrenceLabel(r: Recurrence): { i18n: string; fallback: string } {
  return LABELS[r];
}

/**
 * Returns the next scheduled timestamp for a recurring task, preserving the
 * time-of-day. For month-based recurrences, the day-of-month is clamped to
 * the last valid day of the target month (Jan 31 + 1 month -> Feb 28/29).
 */
export function nextOccurrenceDate(scheduledAt: string, recurrence: Recurrence): string | null {
  if (recurrence === 'none') return null;
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return null;

  if (recurrence === 'weekly') {
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  }

  const months = recurrence === 'monthly' ? 1 : recurrence === 'quarterly' ? 3 : 6;
  const targetYear = d.getFullYear();
  const targetMonth = d.getMonth() + months;
  const originalDay = d.getDate();
  // Use setFullYear so day overflow wraps; then clamp by computing last day.
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(originalDay, lastDay);
  const result = new Date(targetYear, targetMonth, day, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return result.toISOString();
}

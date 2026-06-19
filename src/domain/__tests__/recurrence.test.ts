import { describe, expect, it } from 'vitest';
import { nextOccurrenceDate, recurrenceLabel, RECURRENCE_OPTIONS } from '@/domain/job/recurrence';

describe('nextOccurrenceDate', () => {
  it('returns null when recurrence is none', () => {
    expect(nextOccurrenceDate('2026-06-19T09:00:00.000Z', 'none')).toBeNull();
  });

  it('adds 7 days for weekly', () => {
    expect(nextOccurrenceDate('2026-06-19T09:00:00.000Z', 'weekly')).toBe('2026-06-26T09:00:00.000Z');
  });

  it('adds 1 month for monthly', () => {
    const next = new Date(nextOccurrenceDate('2026-06-19T09:00:00.000Z', 'monthly')!);
    expect(next.getMonth()).toBe(6); // July (0-indexed)
    expect(next.getDate()).toBe(19);
  });

  it('adds 3 months for quarterly', () => {
    const next = new Date(nextOccurrenceDate('2026-06-19T09:00:00.000Z', 'quarterly')!);
    expect(next.getMonth()).toBe(8); // September
    expect(next.getDate()).toBe(19);
  });

  it('adds 6 months for biannual', () => {
    const next = new Date(nextOccurrenceDate('2026-06-19T09:00:00.000Z', 'biannual')!);
    expect(next.getMonth()).toBe(11); // December
    expect(next.getDate()).toBe(19);
  });

  it('clamps Jan 31 -> Feb 28 in a non-leap year', () => {
    const next = new Date(nextOccurrenceDate('2026-01-31T09:00:00.000Z', 'monthly')!);
    expect(next.getMonth()).toBe(1); // February
    expect(next.getDate()).toBe(28);
  });

  it('clamps Jan 31 -> Feb 29 in a leap year', () => {
    const next = new Date(nextOccurrenceDate('2028-01-31T09:00:00.000Z', 'monthly')!);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(29);
  });

  it('clamps Mar 31 -> Apr 30', () => {
    const next = new Date(nextOccurrenceDate('2026-03-31T09:00:00.000Z', 'monthly')!);
    expect(next.getMonth()).toBe(3); // April
    expect(next.getDate()).toBe(30);
  });

  it('preserves time-of-day on monthly clamp', () => {
    const next = new Date(nextOccurrenceDate('2026-01-31T13:45:00.000Z', 'monthly')!);
    expect(next.getHours()).toBe(new Date('2026-01-31T13:45:00.000Z').getHours());
    expect(next.getMinutes()).toBe(new Date('2026-01-31T13:45:00.000Z').getMinutes());
  });
});

describe('recurrenceLabel', () => {
  it('returns a label for each option', () => {
    for (const opt of RECURRENCE_OPTIONS) {
      const label = recurrenceLabel(opt);
      expect(label.i18n).toBeTruthy();
      expect(label.fallback).toBeTruthy();
    }
  });
});

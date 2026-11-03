import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDateTimeShort, riyadhDate } from '@/lib/dates';

describe('Riyadh time (UAT I05)', () => {
  it('dates an instant by the Riyadh calendar, not the device or UTC', () => {
    // 22:30 UTC on the 29th is 01:30 on the 30th in Riyadh (UTC+3).
    expect(riyadhDate(new Date('2026-09-29T22:30:00Z'))).toBe('2026-09-30');
    expect(riyadhDate(new Date('2026-09-29T20:59:00Z'))).toBe('2026-09-29');
  });

  it('shows times in Riyadh time around midnight', () => {
    expect(formatDateTime('2026-09-27T10:00:00Z', 'en')).toMatch(/13:00/);
    expect(formatDateTime('2026-09-29T21:30:00Z', 'en')).toMatch(/30 Sept? 2026.*00:30/);
    expect(formatDateTimeShort('2026-09-29T21:30:00Z', 'en')).toMatch(/30/);
  });
});

/**
 * Calendar dates as YYYY-MM-DD. Work dates and every time shown to users are
 * in Riyadh time (UAT I05), whatever the device's time zone: a 01:00 save in
 * Riyadh is that day, and a report reads the same on every device.
 */
import type { Language } from '@/domain/models/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const APP_TIME_ZONE = 'Asia/Riyadh';

/** Today's date in Riyadh. */
export function localToday(): string {
  return riyadhDate(new Date());
}

/** The Riyadh calendar date of an instant. */
export function riyadhDate(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (type: string) => parts.find((x) => x.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return toDateString(d);
  }
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

export function monthStart(s: string): string {
  return `${s.slice(0, 7)}-01`;
}

export function monthEnd(s: string): string {
  const d = parseDate(monthStart(s));
  return toDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(monthStart(s));
  return toDateString(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/** Every date from..to inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(s: string): number {
  return parseDate(s).getDay();
}

function locale(language: Language): string {
  return language === 'en' ? 'en-GB' : `${language}-u-nu-latn`;
}

export function formatDate(s: string, language: Language, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  try {
    return new Intl.DateTimeFormat(locale(language), opts).format(parseDate(s));
  } catch {
    return s;
  }
}

export function formatMonth(s: string, language: Language): string {
  return formatDate(monthStart(s), language, { month: 'long', year: 'numeric' });
}

export function formatDateTimeShort(iso: string, language: Language): string {
  try {
    return new Intl.DateTimeFormat(locale(language), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: APP_TIME_ZONE }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Date and time of an instant in Riyadh time, e.g. "27 Sept 2026, 13:00". */
export function formatDateTime(iso: string, language: Language): string {
  try {
    return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short', timeZone: APP_TIME_ZONE }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function weekdayName(day: number, language: Language): string {
  // 2023-01-01 was a Sunday.
  return formatDate(`2023-01-${pad(1 + day)}`, language, { weekday: 'short' });
}

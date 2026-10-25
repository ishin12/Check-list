import type { Language } from '@/domain/models/types';

export function nowIso(): string {
  return new Date().toISOString();
}

/** BCP-47 locale for formatting dates/times in the app language. Urdu uses Western digits. */
export function dateLocale(language: Language): string {
  if (language === 'ar') return 'ar';
  if (language === 'ur') return 'ur-PK-u-nu-latn';
  return 'en-GB';
}

type DateInput = string | number | Date;

export function formatDate(
  value: DateInput,
  language: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleDateString(dateLocale(language), options);
}

export function formatTime(
  value: DateInput,
  language: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleTimeString(dateLocale(language), options);
}

export function formatDateAndTime(
  value: DateInput,
  language: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleString(dateLocale(language), options);
}

export function formatDateTime(iso: string, language: Language): string {
  const locale = dateLocale(language);
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

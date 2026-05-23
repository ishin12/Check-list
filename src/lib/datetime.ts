import type { Language } from '@/domain/models/types';

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDateTime(iso: string, language: Language): string {
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

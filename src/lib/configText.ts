import type { ConfigText } from '@/domain/models/ops';
import type { Language } from '@/domain/models/types';

/** Admin-entered text in the current language, falling back to English/Arabic. */
export function configText(t: ConfigText | undefined, language: Language): string {
  if (!t) return '';
  return t[language] || t.en || t.ar || t.ur || '';
}

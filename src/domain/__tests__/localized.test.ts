import { describe, expect, it } from 'vitest';
import {
  createTask,
  createTemplate,
  duplicateTemplate,
  localizedText,
  taskLabel,
  templateTitle,
} from '@/domain/template/template';
import { dateLocale, formatDate, formatTime } from '@/lib/datetime';
import { dirFor, SUPPORTED_LANGUAGES } from '@/i18n';

describe('localizedText', () => {
  it('prefers ur, then en, then ar for Urdu', () => {
    expect(localizedText({ en: 'Clean', ar: 'نظف', ur: 'صاف کریں' }, 'ur')).toBe('صاف کریں');
    expect(localizedText({ en: 'Clean', ar: 'نظف' }, 'ur')).toBe('Clean');
    expect(localizedText({ en: '', ar: 'نظف', ur: '' }, 'ur')).toBe('نظف');
  });

  it('leaves English and Arabic unchanged for templates without Urdu', () => {
    const text = { en: 'Clean', ar: 'نظف' };
    expect(localizedText(text, 'en')).toBe('Clean');
    expect(localizedText(text, 'ar')).toBe('نظف');
    expect(localizedText({ en: 'Clean', ar: '' }, 'ar')).toBe('Clean');
  });

  it('ignores the Urdu text in English and Arabic', () => {
    const text = { en: 'Clean', ar: 'نظف', ur: 'صاف کریں' };
    expect(localizedText(text, 'en')).toBe('Clean');
    expect(localizedText(text, 'ar')).toBe('نظف');
  });

  it('tolerates missing values coming from the database', () => {
    expect(localizedText(null, 'ur')).toBe('');
    expect(localizedText(undefined, 'en')).toBe('');
    expect(localizedText({}, 'ar')).toBe('');
  });

  it('is used by templateTitle and taskLabel', () => {
    const tpl = createTemplate({ en: 'AC', ar: 'مكيف', ur: 'اے سی' });
    tpl.tasks = [createTask(0, { en: 'Filters' })];
    expect(templateTitle(tpl, 'ur')).toBe('اے سی');
    expect(taskLabel(tpl.tasks[0], 'ur')).toBe('Filters');
  });

  it('keeps the Urdu title when duplicating', () => {
    const tpl = createTemplate({ en: 'AC', ar: 'مكيف', ur: 'اے سی' });
    const copy = duplicateTemplate(tpl, { en: '(copy)', ar: '(نسخة)', ur: '(کاپی)' });
    expect(copy.title.ur).toBe('اے سی (کاپی)');
    const plain = duplicateTemplate(createTemplate({ en: 'AC', ar: 'مكيف' }), { en: '(copy)', ar: '(نسخة)' });
    expect('ur' in plain.title).toBe(false);
  });
});

describe('language plumbing', () => {
  it('supports ur and sets RTL for ar and ur only', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'ar', 'ur']);
    expect(dirFor('en')).toBe('ltr');
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('ur')).toBe('rtl');
  });

  it('maps app language to a date locale with Western digits for Urdu', () => {
    expect(dateLocale('en')).toBe('en-GB');
    expect(dateLocale('ar')).toBe('ar');
    expect(dateLocale('ur')).toBe('ur-PK-u-nu-latn');
    const when = new Date('2026-03-04T10:30:00Z');
    expect(formatDate(when, 'ur', { timeZone: 'UTC', day: 'numeric', month: 'long' })).toMatch(/4/);
    expect(formatTime(when, 'ur', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })).toMatch(/10/);
    expect(formatDate(when, 'en', { timeZone: 'UTC' })).toBe('04/03/2026');
  });
});

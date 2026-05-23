import { createTask, createTemplate } from '@/domain/template/template';
import type { Template } from '@/domain/models/types';

/** A single example template so the app isn't empty on first run. */
export function seedTemplates(): Template[] {
  const template = createTemplate({
    en: 'AC Maintenance',
    ar: 'صيانة المكيف',
  });
  template.tasks = [
    createTask(0, { en: 'Inspect unit and filters', ar: 'فحص الوحدة والفلاتر' }),
    createTask(1, { en: 'Clean filters', ar: 'تنظيف الفلاتر' }),
    createTask(2, { en: 'Check refrigerant level', ar: 'فحص مستوى الفريون' }),
    createTask(3, { en: 'Test cooling performance', ar: 'اختبار كفاءة التبريد' }),
    createTask(4, { en: 'Clean up work area', ar: 'تنظيف مكان العمل' }),
  ];
  return [template];
}

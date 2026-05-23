import { describe, expect, it } from 'vitest';
import {
  createTask,
  createTemplate,
  duplicateTemplate,
  moveTask,
  normalizeTaskOrder,
} from '@/domain/template/template';

describe('template domain', () => {
  it('creates an empty bilingual template', () => {
    const template = createTemplate({ en: 'Test' });
    expect(template.title.en).toBe('Test');
    expect(template.title.ar).toBe('');
    expect(template.tasks).toHaveLength(0);
    expect(template.version).toBe(1);
  });

  it('normalizes task order into a 0-based sequence', () => {
    const tasks = [createTask(5), createTask(2), createTask(9)];
    const normalized = normalizeTaskOrder(tasks);
    expect(normalized.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it('moves a task and re-sequences order', () => {
    const tasks = normalizeTaskOrder([createTask(0), createTask(1), createTask(2)]);
    const [a, b, c] = tasks;
    const moved = moveTask(tasks, 0, 2);
    expect(moved.map((t) => t.id)).toEqual([b.id, c.id, a.id]);
    expect(moved.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it('duplicates a template with fresh ids', () => {
    const original = createTemplate({ en: 'Job', ar: 'مهمة' });
    original.tasks = [createTask(0, { en: 'one' })];
    const copy = duplicateTemplate(original, { en: '(copy)', ar: '(نسخة)' });
    expect(copy.id).not.toBe(original.id);
    expect(copy.title.en).toBe('Job (copy)');
    expect(copy.tasks[0].id).not.toBe(original.tasks[0].id);
    expect(copy.tasks[0].label.en).toBe('one');
  });
});

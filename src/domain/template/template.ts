import { newId } from '@/lib/id';
import { nowIso } from '@/lib/datetime';
import type { Language, LocalizedText, Task, Template } from '@/domain/models/types';

export function emptyLocalizedText(): LocalizedText {
  return { en: '', ar: '' };
}

export function createTask(order: number, label?: Partial<LocalizedText>): Task {
  return {
    id: newId(),
    label: { ...emptyLocalizedText(), ...label },
    order,
    required: false,
  };
}

export function createTemplate(title?: Partial<LocalizedText>): Template {
  const ts = nowIso();
  return {
    id: newId(),
    title: { ...emptyLocalizedText(), ...title },
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  };
}

/** Returns a new template with bumped version + updatedAt and re-sequenced task order. */
export function touchTemplate(template: Template): Template {
  return {
    ...template,
    tasks: normalizeTaskOrder(template.tasks),
    updatedAt: nowIso(),
    version: template.version + 1,
  };
}

export function normalizeTaskOrder(tasks: Task[]): Task[] {
  return tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((task, index) => ({ ...task, order: index }));
}

export function moveTask(tasks: Task[], fromIndex: number, toIndex: number): Task[] {
  const ordered = normalizeTaskOrder(tasks);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ordered.length ||
    toIndex >= ordered.length
  ) {
    return ordered;
  }
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  return ordered.map((task, index) => ({ ...task, order: index }));
}

export function duplicateTemplate(template: Template, suffix: LocalizedText): Template {
  const copy = createTemplate();
  return {
    ...copy,
    title: {
      en: `${template.title.en} ${suffix.en}`.trim(),
      ar: `${template.title.ar} ${suffix.ar}`.trim(),
    },
    tasks: normalizeTaskOrder(template.tasks).map((task) => ({
      ...task,
      id: newId(),
    })),
  };
}

export function templateTitle(template: Template, language: Language): string {
  return template.title[language] || template.title.en || template.title.ar;
}

export function taskLabel(task: Task, language: Language): string {
  return task.label[language] || task.label.en || task.label.ar;
}

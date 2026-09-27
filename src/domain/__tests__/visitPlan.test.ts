import { describe, expect, it } from 'vitest';
import {
  applicableTemplates,
  buildReportContent,
  buildVisitTasks,
  recurringItemsFromTemplates,
} from '@/domain/fieldops/visitPlan';
import type { ProjectRecurringItem } from '@/domain/models/ops';
import type { Template } from '@/domain/models/types';

let n = 0;
const newId = () => `new-${++n}`;

function tpl(id: string, scope: { projectTypeId?: string; stageId?: string; active?: boolean }, items: Template['tasks']): Template & { active?: boolean } {
  return { id, title: { en: id, ar: id }, tasks: items, createdAt: '', updatedAt: '', version: 1, ...scope };
}
const item = (id: string, extra: Partial<Template['tasks'][number]> = {}) =>
  ({ id, order: 0, required: false, label: { en: id, ar: `ع-${id}` }, ...extra });

const maint = tpl('maint', { projectTypeId: 'mnt' }, [
  item('clean', { order: 1 }),
  item('prune', { order: 0, required: true, photoRequired: true }),
  item('irrigation', { order: 2, recurrence: 'weekly' }),
]);
const stage = tpl('irr-stage', { stageId: 'st-irr' }, [item('pressure-test')]);
const other = tpl('other', { projectTypeId: 'est' }, [item('x')]);
const inactive = tpl('old', { projectTypeId: 'mnt', active: false }, [item('y')]);
const all = [maint, stage, other, inactive];

describe('applicableTemplates', () => {
  it('takes the type checklists and the current stage checklist', () => {
    expect(applicableTemplates({ projectTypeId: 'mnt' }, all).map((t) => t.id)).toEqual(['maint']);
    expect(applicableTemplates({ projectTypeId: 'est', stageId: 'st-irr' }, all).map((t) => t.id)).toEqual(['irr-stage', 'other']);
  });
});

describe('buildVisitTasks', () => {
  const project = { id: 'P1', projectTypeId: 'mnt' };

  it('adds type checklist items in order, skipping periodic ones', () => {
    const rows = buildVisitTasks({ project, visitId: 'v1', date: '2026-10-05', templates: all, projectTasks: [], recurringItems: [], newId });
    expect(rows.map((r) => [r.templateItemId, r.source, r.required, r.photoRequired])).toEqual([
      ['prune', 'checklist', true, true],
      ['clean', 'checklist', false, false],
    ]);
    expect(rows.every((r) => r.visitId === 'v1' && r.status === 'open')).toBe(true);
  });

  it('does not duplicate an item that is still open (carried over)', () => {
    const rows = buildVisitTasks({
      project, visitId: 'v2', date: '2026-10-05', templates: all, recurringItems: [], newId,
      projectTasks: [
        { templateId: 'maint', templateItemId: 'prune', status: 'needs_follow_up', source: 'checklist' },
        { templateId: 'maint', templateItemId: 'clean', status: 'completed', source: 'checklist' },
      ],
    });
    expect(rows.map((r) => r.templateItemId)).toEqual(['clean']);
  });

  it('stage items are created once per project and are always required', () => {
    const p = { id: 'P2', projectTypeId: 'est', stageId: 'st-irr' };
    const first = buildVisitTasks({ project: p, visitId: 'v1', date: '2026-10-05', templates: [stage], projectTasks: [], recurringItems: [], newId });
    expect(first.map((r) => [r.source, r.required])).toEqual([['stage', true]]);
    const again = buildVisitTasks({
      project: p, visitId: 'v2', date: '2026-10-06', templates: [stage], recurringItems: [], newId,
      projectTasks: [{ templateId: 'irr-stage', templateItemId: 'pressure-test', status: 'completed', source: 'stage' }],
    });
    expect(again).toEqual([]);
  });

  it('TC-06 adds due recurring items once, overdue included', () => {
    const recurring: ProjectRecurringItem[] = [
      { id: 'r1', projectId: 'P1', description: 'Irrigation check', recurrence: 'weekly', nextDueOn: '2026-10-01', photoRequired: false, active: true },
      { id: 'r2', projectId: 'P1', description: 'Spraying', recurrence: 'monthly', nextDueOn: '2026-11-01', photoRequired: false, active: true },
    ];
    const rows = buildVisitTasks({ project, visitId: 'v1', date: '2026-10-05', templates: [], projectTasks: [], recurringItems: recurring, newId });
    expect(rows.map((r) => [r.recurringItemId, r.source, r.required])).toEqual([['r1', 'recurring', true]]);
    const again = buildVisitTasks({
      project, visitId: 'v2', date: '2026-10-06', templates: [], recurringItems: recurring, newId,
      projectTasks: [{ recurringItemId: 'r1', status: 'open', source: 'recurring' }],
    });
    expect(again).toEqual([]);
  });
});

describe('recurringItemsFromTemplates', () => {
  it('creates tracked items for periodic template items only once', () => {
    const project = { id: 'P1', projectTypeId: 'mnt' };
    const items = recurringItemsFromTemplates(project, all, [], '2026-10-05', newId);
    expect(items.map((i) => [i.templateItemId, i.recurrence, i.nextDueOn])).toEqual([['irrigation', 'weekly', '2026-10-05']]);
    expect(recurringItemsFromTemplates(project, all, [{ templateId: 'maint', templateItemId: 'irrigation' }], '2026-10-05', newId)).toEqual([]);
  });
});

describe('buildReportContent (TC-09)', () => {
  it('reflects recorded tasks, photos and crew without re-entry', () => {
    const content = buildReportContent({
      visitId: 'v1', reportNumber: 7,
      project: { name: 'Garden', code: 'MNT-1' }, clientName: 'Khaled', visitDate: '2026-10-05', supervisorName: 'Ahmed',
      tasks: [
        { id: 't1', description: 'Pruning', status: 'completed', completedInVisitId: 'v1', lastVisitId: 'v1' },
        { id: 't2', description: 'Fertilizing', status: 'needs_follow_up', lastVisitId: 'v1', note: 'No fertilizer' },
        { id: 't3', description: 'Weeding', status: 'open', lastVisitId: 'v1', note: 'Rain' },
        { id: 't4', description: 'Untouched optional', status: 'open' },
        { id: 't5', description: 'Done later', status: 'completed', completedInVisitId: 'v2', lastVisitId: 'v2' },
      ],
      photos: [
        { id: 'p1', taskId: 't1', visitId: 'v1', kind: 'before', storagePath: 'a', mime: 'image/jpeg' },
        { id: 'p2', taskId: 't1', visitId: 'v1', kind: 'after', storagePath: 'b', mime: 'image/jpeg' },
        { id: 'p3', taskId: 't1', visitId: 'v0', kind: 'before', storagePath: 'c', mime: 'image/jpeg' },
        { id: 'p4', taskId: 't1', visitId: 'v1', kind: 'after', storagePath: 'd', mime: 'image/jpeg', voidedAt: 'x' },
      ],
      crew: [{ name: 'Rafiq', duration: 1 }, { name: 'Karim', duration: 0.5 }],
    });
    expect(content.required.map((l) => l.taskId)).toEqual(['t1', 't2', 't3']);
    expect(content.done.map((l) => l.taskId)).toEqual(['t1']);
    expect(content.followUp.map((l) => [l.taskId, l.status])).toEqual([['t2', 'needs_follow_up'], ['t3', 'open']]);
    expect(content.done[0].photos.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(content.crew).toHaveLength(2);
    expect(content.reportNumber).toBe(7);
  });
});

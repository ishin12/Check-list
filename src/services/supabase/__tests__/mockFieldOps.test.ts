import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getMockClient } from '@/services/supabase/mockClient';
import { localToday } from '@/lib/dates';

// The demo backend must refuse what Postgres refuses (0006_field_ops.sql), so
// what the owner tries in demo mode behaves the same in production.

const sb = getMockClient();
const today = new Date().toISOString().slice(0, 10);

async function asUser(id: string) {
  await window.__demo!.setActiveUser(id);
}

beforeEach(async () => {
  await window.__demo!.reset();
  await asUser('u-wa');
});

function labor(employee_id: string, duration: number, extra: Record<string, unknown> = {}) {
  return { work_date: '2026-09-01', employee_id, project_id: 'pr-1', duration, supervisor_id: 'u-wa', work_type_id: 'wt-maintenance', ...extra };
}

describe('demo backend mirrors the field-ops rules', () => {
  it('seeds the configuration and demo data', async () => {
    const { data: types } = await sb.from('project_types').select('*');
    expect(types.map((t: { code: string }) => t.code)).toEqual(['establishment', 'maintenance', 'modification', 'other']);
    const { data: stages } = await sb.from('project_stages').select('*');
    expect(stages).toHaveLength(6);
  });

  it('TC-01 / BR-001 rejects loading a worker past 1.0 day', async () => {
    expect((await sb.from('labor_allocations').insert(labor('em-5', 1))).error).toBeNull();
    const { error } = await sb.from('labor_allocations').insert(labor('em-5', 0.5, { project_id: 'pr-2' }));
    expect(error?.message).toMatch(/BR-001/);
  });

  it('TC-03 inserts a crew as separate rows, all-or-nothing', async () => {
    const crew = ['em-1', 'em-2', 'em-4', 'em-5', 'em-6'].map((e) => labor(e, 1, { work_date: '2026-09-03' }));
    const ok = await sb.from('labor_allocations').insert(crew).select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(5);

    // Second batch: em-6 is already full, so nothing from this batch is kept.
    const bad = await sb.from('labor_allocations').insert([
      labor('em-3', 1, { work_date: '2026-09-03' }),
      labor('em-6', 0.5, { work_date: '2026-09-03', project_id: 'pr-2' }),
    ]);
    expect(bad.error?.message).toMatch(/BR-001/);
    const { data } = await sb.from('labor_allocations').select('*').eq('work_date', '2026-09-03');
    expect(data).toHaveLength(5);
  });

  it('BR-002 accepts only full or half days', async () => {
    const { error } = await sb.from('labor_allocations').insert(labor('em-1', 0.25));
    expect(error?.message).toMatch(/duration_full_or_half/);
  });

  it('TC-07 / TC-08 month close locks supervisors, finance edits with a reason', async () => {
    const { data: row } = await sb.from('labor_allocations').insert(labor('em-1', 1)).select().single();

    expect((await sb.from('month_closes').insert({ month: '2026-09-01' })).error?.message).toMatch(/row-level security/);
    await asUser('u-mgr'); // demo manager has finance granted
    expect((await sb.from('month_closes').insert({ month: '2026-09-01' })).error).toBeNull();

    await asUser('u-wa');
    const locked = await sb.from('labor_allocations').update({ duration: 0.5 }).eq('id', row.id);
    expect(locked.error?.message).toMatch(/BR-009/);

    await asUser('u-mgr');
    const noReason = await sb.from('labor_allocations').update({ duration: 0.5 }).eq('id', row.id);
    expect(noReason.error?.message).toMatch(/BR-010/);
    const fixed = await sb.from('labor_allocations').update({ duration: 0.5, change_reason: 'Left at noon' }).eq('id', row.id);
    expect(fixed.error).toBeNull();

    const { data: audit } = await sb.from('audit_log').select('*').eq('entity_id', row.id).eq('action', 'labor_allocations.update');
    expect(audit[0].payload.old.duration).toBe(1);
    expect(audit[0].payload.new.duration).toBe(0.5);
    expect(audit[0].payload.new.change_reason).toBe('Left at noon');
  });

  it('a refused update leaves the row unchanged', async () => {
    const { data: row } = await sb.from('labor_allocations').insert(labor('em-1', 0.5)).select().single();
    await sb.from('labor_allocations').insert(labor('em-1', 0.5, { project_id: 'pr-2' }));
    const { error } = await sb.from('labor_allocations').update({ duration: 1 }).eq('id', row.id);
    expect(error?.message).toMatch(/BR-001/);
    const { data } = await sb.from('labor_allocations').select('*').eq('id', row.id).single();
    expect(data.duration).toBe(0.5);
  });

  it('BR-014 blocks hard deletes', async () => {
    expect((await sb.from('projects').delete().eq('id', 'pr-3')).error?.message).toMatch(/BR-014/);
    expect((await sb.from('labor_allocations').delete().eq('id', 'la-1')).error?.message).toMatch(/BR-014/);
    expect((await sb.from('project_tasks').delete().eq('id', 'pt-2')).error?.message).toMatch(/BR-014/);
    expect((await sb.from('visits').delete().eq('id', 'vi-1')).error?.message).toMatch(/BR-014/);
    const { data } = await sb.from('projects').select('*').eq('id', 'pr-3');
    expect(data).toHaveLength(1);
  });

  it('TC-04 follow-up survives visit completion; states only move forward', async () => {
    await asUser('u-wb');   // Sara supervises pr-2 (vi-2, pt-4, pt-5)
    await sb.from('project_tasks').update({ status: 'needs_follow_up' }).eq('id', 'pt-4');
    await sb.from('project_tasks').update({ status: 'completed' }).eq('id', 'pt-5');
    expect((await sb.from('visits').update({ status: 'completed' }).eq('id', 'vi-2')).error).toBeNull();
    const { data: t4 } = await sb.from('project_tasks').select('*').eq('id', 'pt-4').single();
    expect(t4.status).toBe('needs_follow_up');

    expect((await sb.from('project_tasks').update({ status: 'open' }).eq('id', 'pt-4')).error?.message).toMatch(/cannot go back/);
    expect((await sb.from('project_tasks').update({ status: 'open' }).eq('id', 'pt-5')).error?.message).toMatch(/cannot be reopened/);
    expect((await sb.from('visits').update({ status: 'in_progress', work_type_id: 'wt-maintenance' }).eq('id', 'vi-2')).error?.message).toMatch(/cannot move/);
  });

  it('D-10: a supervisor sees only the projects they supervise (RLS)', async () => {
    const { data: projects } = await sb.from('projects').select('*');
    expect(projects.map((p: { id: string }) => p.id).sort()).toEqual(['pr-1', 'pr-3']);
    const { data: visits } = await sb.from('visits').select('*');
    expect(visits.every((v: { project_id: string }) => v.project_id !== 'pr-2')).toBe(true);
    const { data: hidden } = await sb.from('project_tasks').select('*').eq('id', 'pt-4');
    expect(hidden).toEqual([]);
    await asUser('u-fin');
    expect((await sb.from('projects').select('*')).data.length).toBe(3);
  });

  it('a project with open tasks cannot be closed', async () => {
    const { error } = await sb.from('projects').update({ status: 'completed' }).eq('id', 'pr-1');
    expect(error?.message).toMatch(/cannot be closed/);
  });

  it('TC-06 / BR-011 completing a recurring task rolls its dates', async () => {
    await sb.from('project_tasks').update({ status: 'completed', completed_at: `${today}T09:00:00.000Z` }).eq('id', 'pt-3');
    const { data: item } = await sb.from('project_recurring_items').select('*').eq('id', 'ri-1').single();
    expect(item.last_done_on).toBe(today);
    expect(item.next_due_on > today).toBe(true);
  });
});

describe('review fixes mirrored in the demo backend', () => {
  it('a Done correction on a follow-up stays a follow-up', async () => {
    const { data: v } = await sb.from('visits').insert({ project_id: 'pr-1', visit_date: localToday(), supervisor_id: 'u-wa' }).select().single();
    await sb.from('visits').update({ status: 'in_progress', work_type_id: 'wt-maintenance' }).eq('id', v.id);
    await sb.from('project_tasks').update({ status: 'completed', completed_in_visit_id: v.id }).eq('id', 'pt-1');
    await sb.from('project_tasks').update({ status: 'open' }).eq('id', 'pt-1');
    const { data } = await sb.from('project_tasks').select('*').eq('id', 'pt-1').single();
    expect(data.status).toBe('needs_follow_up');
  });

  it('C03: no task can be deleted, used or not (BR-014, migration 0008)', async () => {
    await asUser('u-mgr');
    const { data: fresh } = await sb.from('project_tasks').insert({ project_id: 'pr-1', description: 'Edging', source: 'checklist', required: false }).select().single();
    for (const id of ['pt-5', fresh.id]) {
      const { error } = await sb.from('project_tasks').delete().eq('id', id);
      expect(error?.message).toMatch(/BR-014/);
    }
  });

  it('I04: a completed / closed project takes no new visit (BR-008)', async () => {
    // pr-3 is completed in the seed.
    const { error } = await sb.from('visits').insert({ project_id: 'pr-3', visit_date: '2026-10-23', supervisor_id: 'u-wa' });
    expect(error?.message).toMatch(/BR-008/);
  });

  it('I01: a project cannot move past a stage whose required items are not done', async () => {
    await asUser('u-mgr');
    // pr-2 is on the irrigation stage with its three required items open.
    const { error } = await sb.from('projects').update({ stage_id: 'st-planting_ready' }).eq('id', 'pr-2');
    expect(error?.message).toMatch(/STAGE-GATE/);
    const skip = await sb.from('projects').update({ stage_id: 'st-handover' }).eq('id', 'pr-2');
    expect(skip.error?.message).toMatch(/STAGE-GATE/);
    // Moving back is allowed.
    expect((await sb.from('projects').update({ stage_id: 'st-preparatory' }).eq('id', 'pr-2')).error).toBeNull();
  });

  it('supervisors cannot hand visits to others or rewrite issued reports', async () => {
    expect((await sb.from('visits').update({ supervisor_id: 'u-wb' }).eq('id', 'vi-1')).error?.message).toMatch(/completed visit/);
    const { data: v } = await sb.from('visits').insert({ project_id: 'pr-1', visit_date: '2026-10-23', supervisor_id: 'u-wa' }).select().single();
    expect((await sb.from('visits').update({ supervisor_id: 'u-wb' }).eq('id', v.id)).error?.message).toMatch(/themselves/);
    await sb.from('visit_reports').update({ content: { done: [] } }).eq('id', 'vr-1');
    expect((await sb.from('visit_reports').update({ content: { done: ['x'] } }).eq('id', 'vr-1')).error?.message).toMatch(/rewritten/);
    expect((await sb.from('visit_reports').update({ signer_name: 'Khaled' }).eq('id', 'vr-1')).error).toBeNull();
  });
});

describe('Master Spec v2.2 in the demo backend (0009)', () => {
  it('TC-13 the visit work type goes to its crew without per-worker entry, and follows a change', async () => {
    const { data: v } = await sb.from('visits').insert({ project_id: 'pr-1', visit_date: localToday(), supervisor_id: 'u-wa' }).select().single();
    expect((await sb.from('visits').update({ status: 'in_progress' }).eq('id', v.id)).error?.message).toMatch(/WORK-TYPE/);
    await sb.from('visits').update({ status: 'in_progress', work_type_id: 'wt-maintenance' }).eq('id', v.id);
    const crew = ['em-1', 'em-2'].map((e) => ({ work_date: localToday(), employee_id: e, project_id: 'pr-1', visit_id: v.id, duration: 0.5, supervisor_id: 'u-wa' }));
    expect((await sb.from('labor_allocations').insert(crew)).error).toBeNull();
    let { data } = await sb.from('labor_allocations').select('*').eq('visit_id', v.id);
    expect(data.map((r: { work_type_id: string }) => r.work_type_id)).toEqual(['wt-maintenance', 'wt-maintenance']);
    await sb.from('visits').update({ work_type_id: 'wt-irrigation' }).eq('id', v.id);
    ({ data } = await sb.from('labor_allocations').select('*').eq('visit_id', v.id));
    expect(data.every((r: { work_type_id: string }) => r.work_type_id === 'wt-irrigation')).toBe(true);
  });

  it('TC-14 a full day on the warehouse target, no project', async () => {
    const before = (await sb.from('projects').select('*')).data.length;
    const { error } = await sb.from('labor_allocations').insert({ work_date: '2026-09-05', employee_id: 'em-6', operational_target_id: 'ot-warehouse', work_type_id: 'wt-transport', duration: 1, supervisor_id: 'u-wa' });
    expect(error).toBeNull();
    expect((await sb.from('projects').select('*')).data.length).toBe(before);
    expect((await sb.from('labor_allocations').insert(labor('em-6', 0.5, { work_date: '2026-09-05' }))).error?.message).toMatch(/BR-001/);
  });

  it('TC-15 half project + half target = 1.0, a third half is refused', async () => {
    expect((await sb.from('labor_allocations').insert(labor('em-6', 0.5, { work_date: '2026-09-06' }))).error).toBeNull();
    expect((await sb.from('labor_allocations').insert({ work_date: '2026-09-06', employee_id: 'em-6', operational_target_id: 'ot-company_general', work_type_id: 'wt-general', duration: 0.5, supervisor_id: 'u-wa' })).error).toBeNull();
    const third = await sb.from('labor_allocations').insert({ work_date: '2026-09-06', employee_id: 'em-6', operational_target_id: 'ot-office', work_type_id: 'wt-general', duration: 0.5, supervisor_id: 'u-wa' });
    expect(third.error?.message).toMatch(/BR-001/);
  });

  it('a row is on a project or a target, never both or neither, and needs a work type', async () => {
    expect((await sb.from('labor_allocations').insert(labor('em-6', 1, { operational_target_id: 'ot-office' }))).error?.message).toMatch(/labor_project_or_target/);
    expect((await sb.from('labor_allocations').insert(labor('em-6', 1, { project_id: null }))).error?.message).toMatch(/labor_project_or_target/);
    expect((await sb.from('labor_allocations').insert(labor('em-6', 1, { work_type_id: null }))).error?.message).toMatch(/WORK-TYPE/);
  });

  it('list names need English and Arabic and are unique', async () => {
    await asUser('u-mgr');
    expect((await sb.from('work_types').insert({ code: 'x', name: { en: 'planting ', ar: 'جديد' } })).error?.message).toMatch(/unique/);
    expect((await sb.from('operational_targets').insert({ code: 'y', name: { en: 'Yard' } })).error?.message).toMatch(/_names/);
    expect((await sb.from('operational_targets').insert({ code: 'y', name: { en: 'Yard', ar: 'الساحة' } })).error).toBeNull();
  });

  it('a month with a visit in progress cannot be closed (§36A)', async () => {
    await asUser('u-mgr');
    const month = `${localToday().slice(0, 7)}-01`;
    expect((await sb.from('month_closes').insert({ month })).error?.message).toMatch(/MONTH-OPEN-VISITS/);
  });
});


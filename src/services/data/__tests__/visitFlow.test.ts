import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { completeVisit, startVisit, syncVisitTasks } from '@/services/data/visitFlow';
import {
  answerTask,
  createVisit,
  getProject,
  getReportForVisit,
  getVisit,
  listLabor,
  listRecurring,
  listTasks,
  listVisits,
  uploadTaskPhoto,
} from '@/services/data/fieldOps';
import { canCompleteVisit, visitCompletionCheck } from '@/domain/fieldops/fieldOps';

const today = new Date().toISOString().slice(0, 10);

const names = {
  projectName: 'Khaled Residence — garden',
  clientName: 'Khaled Residence',
  supervisorName: 'Ahmed',
  employeeName: (id: string) => id,
  taskLabel: (t: { description: string }) => t.description,
};

beforeEach(async () => {
  await window.__demo!.reset();
  await window.__demo!.setActiveUser('u-wa');
});

describe('supervisor visit cycle (demo backend)', () => {
  it('starts a visit with crew, adds the due checklist, completes and issues the report', async () => {
    const project = (await getProject('pr-1'))!;
    const visitId = await startVisit({
      project, supervisorId: 'u-wa', date: today,
      crew: [{ employeeId: 'em-1', duration: 1 }, { employeeId: 'em-2', duration: 0.5 }],
    });

    const visit = (await getVisit(visitId))!;
    expect(visit.status).toBe('in_progress');
    expect(await listLabor({ visitId })).toHaveLength(2);

    const tasks = await listTasks({ projectId: 'pr-1' });
    const onVisit = tasks.filter((t) => t.status !== 'completed');
    // Carried follow-up + open recurring irrigation check + due periodic items + type checklist.
    expect(onVisit.map((t) => t.description)).toEqual(expect.arrayContaining([
      'Fertilizing', 'Irrigation network check', 'Plant and general condition check', 'Cleaning', 'Pruning',
    ]));
    // No duplicates when syncing again.
    expect(await syncVisitTasks(project, visitId, today)).toBe(0);

    // Answer the required items; Cleaning needs a photo.
    const required = onVisit.filter((t) => t.required);
    for (const t of required) {
      await answerTask(t, visitId, t.description === 'Fertilizing' ? 'follow_up' : 'done', t.description === 'Fertilizing' ? 'Still waiting for delivery' : undefined);
    }
    let after = await listTasks({ projectId: 'pr-1' });
    let check = visitCompletionCheck(visitId, after.filter((t) => t.status !== 'completed' || t.completedInVisitId === visitId), new Set(), 2);
    expect(check.missingPhotos).toHaveLength(1);
    expect(canCompleteVisit(check)).toBe(false);

    const cleaning = after.find((t) => t.description === 'Cleaning' && t.completedInVisitId === visitId)!;
    await uploadTaskPhoto({ taskId: cleaning.id, visitId, projectId: 'pr-1', kind: 'after', file: new Blob(['x'], { type: 'image/png' }), mime: 'image/png' });
    check = visitCompletionCheck(visitId, after.filter((t) => t.status !== 'completed' || t.completedInVisitId === visitId), new Set([cleaning.id]), 2);
    expect(canCompleteVisit(check)).toBe(true);

    const report = await completeVisit(visit, names);
    expect((await getVisit(visitId))!.status).toBe('completed');
    expect(report.reportNumber).toBeGreaterThan(1);
    expect(report.content!.done.map((l) => l.description)).toEqual(expect.arrayContaining(['Cleaning']));
    expect(report.content!.followUp.map((l) => l.description)).toEqual(['Fertilizing']);
    expect(report.content!.done.find((l) => l.description === 'Cleaning')!.photos).toHaveLength(1);
    expect(report.content!.crew).toHaveLength(2);

    // TC-04: the follow-up is still open after completion.
    after = await listTasks({ projectId: 'pr-1' });
    expect(after.find((t) => t.description === 'Fertilizing' && t.status === 'needs_follow_up')).toBeTruthy();
    // Untouched optional checklist items were dropped, not left open.
    expect(after.filter((t) => t.visitId === visitId && !t.required && t.status === 'open')).toEqual([]);
    // BR-011: the completed irrigation check rolled its dates.
    const irr = (await listRecurring({ projectId: 'pr-1' })).find((r) => r.id === 'ri-1')!;
    expect(irr.lastDoneOn).toBe(today);

    const stored = await getReportForVisit(visitId);
    expect(stored!.content!.followUp).toHaveLength(1);
  });

  it('a refused crew leaves no half-started visit (BR-001)', async () => {
    const project = (await getProject('pr-1'))!;
    // em-3 is already on a full day at pr-2 today in the seed.
    await expect(startVisit({
      project, supervisorId: 'u-wa', date: today,
      crew: [{ employeeId: 'em-1', duration: 1 }, { employeeId: 'em-3', duration: 0.5 }],
    })).rejects.toThrow(/BR-001/);
    expect(await listVisits({ projectId: 'pr-1', from: today, to: today })).toEqual([]);
    expect(await listLabor({ projectId: 'pr-1', from: today, to: today })).toEqual([]);
  });

  it('a planned visit is started (and its crew booked) on the day it happens', async () => {
    await window.__demo!.setActiveUser('u-mgr');
    const project = (await getProject('pr-1'))!;
    const planned = await createVisit({ projectId: 'pr-1', visitDate: '2099-01-15', supervisorId: 'u-wa' });
    await window.__demo!.setActiveUser('u-wa');
    const id = await startVisit({ project, supervisorId: 'u-wa', date: today, crew: [{ employeeId: 'em-5', duration: 1 }], plannedVisit: planned });
    expect(id).toBe(planned.id);
    expect((await getVisit(id))!.visitDate).toBe(today);
    expect((await listLabor({ visitId: id }))[0].workDate).toBe(today);
  });

  it('completing keeps an optional item that has a photo', async () => {
    const project = (await getProject('pr-1'))!;
    const visitId = await startVisit({ project, supervisorId: 'u-wa', date: today, crew: [{ employeeId: 'em-5', duration: 1 }] });
    const tasks = await listTasks({ projectId: 'pr-1' });
    const optional = tasks.find((t) => t.visitId === visitId && !t.required)!;
    await uploadTaskPhoto({ taskId: optional.id, visitId, projectId: 'pr-1', kind: 'before', file: new Blob(['x']), mime: 'image/png' });
    for (const t of tasks.filter((x) => x.required && x.status !== 'completed')) {
      await answerTask(t, visitId, 'not_done');
    }
    await completeVisit((await getVisit(visitId))!, names);
    expect((await listTasks({ projectId: 'pr-1' })).some((t) => t.id === optional.id)).toBe(true);
  });
});


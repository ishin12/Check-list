import { describe, expect, it } from 'vitest';
import { createTask, createTemplate } from '@/domain/template/template';
import {
  canCompleteJob,
  completeJob,
  countChecked,
  requiredTasksDone,
  setSignature,
  setTaskChecked,
  startJob,
} from '@/domain/job/job';
import type { Template } from '@/domain/models/types';

function templateWith(required: boolean): Template {
  const template = createTemplate({ en: 'Job' });
  template.tasks = [
    { ...createTask(0, { en: 'a' }), required },
    createTask(1, { en: 'b' }),
  ];
  return template;
}

describe('job domain', () => {
  it('starts a job with a frozen template snapshot and unchecked results', () => {
    const template = templateWith(false);
    const job = startJob(template, 'en');
    expect(job.templateSnapshot.id).toBe(template.id);
    expect(job.results).toHaveLength(2);
    expect(countChecked(job.results)).toBe(0);
    expect(job.status).toBe('draft');
  });

  it('requires required tasks to be checked before continuing', () => {
    const job = startJob(templateWith(true), 'en');
    expect(requiredTasksDone(job)).toBe(false);
    const checked = setTaskChecked(job, job.templateSnapshot.tasks[0].id, true);
    expect(requiredTasksDone(checked)).toBe(true);
  });

  it('only allows completion with required tasks done and a signature', () => {
    let job = startJob(templateWith(true), 'en');
    job = setTaskChecked(job, job.templateSnapshot.tasks[0].id, true);
    expect(canCompleteJob(job)).toBe(false);
    job = setSignature(job, { dataUrl: 'data:image/png;base64,x', signedAt: 'now' });
    expect(canCompleteJob(job)).toBe(true);
    const completed = completeJob(job);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeDefined();
  });
});

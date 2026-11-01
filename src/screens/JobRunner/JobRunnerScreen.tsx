import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { useCurrentJob } from '@/app/providers/CurrentJobContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import {
  countChecked,
  requiredTasksDone,
  setCustomer,
  setTaskChecked,
  setTaskNote,
} from '@/domain/job/job';
import { taskLabel, templateTitle } from '@/domain/template/template';
import { Icon } from '@/components/Icon';
import '@/styles/screens/field.css';

export function JobRunnerScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { job, setJob } = useCurrentJob();
  const { language } = useLanguage();
  const [openNote, setOpenNote] = useState<string | null>(null);

  useEffect(() => {
    if (!job) navigate('/', { replace: true });
  }, [job, navigate]);

  if (!job) return null;

  const tasks = job.templateSnapshot.tasks;
  const done = countChecked(job.results);
  const canContinue = requiredTasksDone(job);
  const resultFor = (taskId: string) =>
    job.results.find((r) => r.taskId === taskId);

  return (
    <div className="app-shell">
      <AppHeader title={templateTitle(job.templateSnapshot, language)} showBack />
      <main className="app-main job-run">
        <div className="card stack">
          <div className="field">
            <label className="field__label">{t('job.customerName')}</label>
            <input
              className="input"
              value={job.customer?.name ?? ''}
              onChange={(e) => setJob(setCustomer(job, { name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('job.customerPhone')}</label>
            <input
              className="input"
              type="tel"
              dir="ltr"
              value={job.customer?.phone ?? ''}
              onChange={(e) => setJob(setCustomer(job, { phone: e.target.value }))}
            />
            <span className="hint">{t('job.phoneHint')}</span>
          </div>
        </div>

        <div className="progress job-progress">
          <div className="job-progress__label">
            {t('job.progress', { done, total: tasks.length })}
          </div>
          <div className="progress__track">
            <div
              className="progress__fill"
              style={{
                width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="stack">
          {tasks.map((task) => {
            const result = resultFor(task.id);
            const checked = !!result?.checked;
            return (
              <div
                key={task.id}
                className={`check-item ${checked ? 'check-item--done' : ''}`}
              >
                <div className="check-item__row">
                  <button
                    type="button"
                    className="check-item__main"
                    onClick={() => setJob(setTaskChecked(job, task.id, !checked))}
                  >
                    <span className={`checkbox ${checked ? 'checkbox--checked' : ''}`}>
                      <Icon name="check" />
                    </span>
                    <span className="check-item__label">
                      {taskLabel(task, language)}
                    </span>
                    {task.required ? (
                      <span className="badge">{t('job.requiredBadge')}</span>
                    ) : null}
                  </button>
                  {openNote === task.id || result?.note ? null : (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('job.addNote')}
                      title={t('job.addNote')}
                      onClick={() => setOpenNote(task.id)}
                    >
                      <Icon name="note" />
                    </button>
                  )}
                </div>

                {openNote === task.id || result?.note ? (
                  <textarea
                    className="textarea"
                    placeholder={t('job.notePlaceholder')}
                    value={result?.note ?? ''}
                    onChange={(e) => setJob(setTaskNote(job, task.id, e.target.value))}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </main>

      <div className="action-bar">
        {!canContinue ? (
          <div className="job-run__hint">
            {t('job.requiredRemaining')}
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={!canContinue}
          onClick={() => navigate('/signature')}
        >
          {t('job.toSignature')}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { useStorage } from '@/app/providers/StorageContext';
import {
  createTask,
  createTemplate,
  moveTask,
  normalizeTaskOrder,
  touchTemplate,
} from '@/domain/template/template';
import type { Task, Template } from '@/domain/models/types';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { RECURRENCE_OPTIONS, recurrenceLabel, type Recurrence } from '@/domain/job/recurrence';
import { configText } from '@/lib/configText';
import { friendlyError } from '@/lib/ruleErrors';

export function TemplateEditorScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storage = useStorage();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [template, setTemplate] = useState<Template | null>(null);
  const [error, setError] = useState('');
  const fd = useFieldData();
  const { language } = useLanguage();

  useEffect(() => {
    if (isNew) {
      setTemplate(createTemplate());
    } else {
      storage.getTemplate(id!).then((found) => {
        setTemplate(found ?? createTemplate());
      });
    }
  }, [id, isNew, storage]);

  const tasks = useMemo(
    () => (template ? normalizeTaskOrder(template.tasks) : []),
    [template],
  );

  if (!template) return null;

  const update = (patch: Partial<Template>) =>
    setTemplate({ ...template, ...patch });

  const updateTask = (taskId: string, patch: Partial<Task>) =>
    setTemplate({
      ...template,
      tasks: template.tasks.map((task) =>
        task.id === taskId ? { ...task, ...patch } : task,
      ),
    });

  const addTask = () =>
    setTemplate({
      ...template,
      tasks: [...template.tasks, createTask(template.tasks.length)],
    });

  const removeTask = (taskId: string) =>
    setTemplate({
      ...template,
      tasks: template.tasks.filter((task) => task.id !== taskId),
    });

  const reorder = (from: number, to: number) =>
    setTemplate({ ...template, tasks: moveTask(template.tasks, from, to) });

  const save = async () => {
    if (!template.title.en.trim() && !template.title.ar.trim()) {
      setError(t('editor.nameRequired'));
      return;
    }
    try {
      await storage.saveTemplate(touchTemplate(template));
      await fd.refresh();
      navigate('/templates');
    } catch (e) {
      setError(friendlyError(e, t));
    }
  };

  return (
    <AppShell>
      <AppHeader
        title={isNew ? t('editor.newTitle') : t('editor.editTitle')}
        showBack
      />
      <main className="app-main">
        <div className="card stack">
          <div className="field">
            <label className="field__label">{t('editor.nameEn')}</label>
            <input
              className="input"
              dir="ltr"
              value={template.title.en}
              placeholder={t('editor.namePlaceholderEn')}
              onChange={(e) =>
                update({ title: { ...template.title, en: e.target.value } })
              }
            />
          </div>
          <div className="field">
            <label className="field__label">{t('editor.nameAr')}</label>
            <input
              className="input"
              dir="rtl"
              value={template.title.ar}
              placeholder={t('editor.namePlaceholderAr')}
              onChange={(e) =>
                update({ title: { ...template.title, ar: e.target.value } })
              }
            />
          </div>
          <div className="field">
            <label className="field__label">{t('fo.config.nameUr', 'Name (Urdu, optional)')}</label>
            <input
              className="input"
              dir="rtl"
              lang="ur"
              value={template.title.ur ?? ''}
              onChange={(e) =>
                update({ title: { ...template.title, ur: e.target.value } })
              }
            />
          </div>
        </div>

        {/* Scope (§9, §25): which project type or stage this checklist is for. */}
        <div className="card stack">
          <div className="card__title">{t('fo.tpl.scope', 'Used for')}</div>
          <div className="field">
            <label className="field__label">{t('fo.projects.type', 'Project type')}</label>
            <select
              className="input"
              value={template.projectTypeId ?? ''}
              onChange={(e) => update({ projectTypeId: e.target.value || undefined, stageId: undefined })}
            >
              <option value="">{t('fo.tpl.noScope', 'Not linked (older task list only)')}</option>
              {fd.types.map((ty) => <option key={ty.id} value={ty.id}>{configText(ty.name, language)}</option>)}
            </select>
          </div>
          {fd.type(template.projectTypeId)?.usesStages ? (
            <div className="field">
              <label className="field__label">{t('fo.projects.stage', 'Current stage')}</label>
              <select
                className="input"
                value={template.stageId ?? ''}
                onChange={(e) => update({ stageId: e.target.value || undefined })}
              >
                <option value="">{t('fo.tpl.allStages', 'Every visit (no stage)')}</option>
                {fd.stages.filter((s) => s.projectTypeId === template.projectTypeId).sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((s) => <option key={s.id} value={s.id}>{s.sortOrder}. {configText(s.name, language)}</option>)}
              </select>
            </div>
          ) : null}
          <p className="hint">{t('fo.tpl.scopeHint', 'Items without a frequency appear on every visit (stage items once per project). Items with a frequency are tracked per project and appear when due.')}</p>
        </div>

        <div className="section-title">{t('editor.tasks')}</div>
        {tasks.length === 0 ? (
          <p className="hint">{t('editor.noTasks')}</p>
        ) : (
          <div className="stack">
            {tasks.map((task, index) => (
              <div key={task.id} className="card stack">
                <div className="row">
                  <span className="badge">{index + 1}</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('editor.moveUp')}
                    disabled={index === 0}
                    onClick={() => reorder(index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('editor.moveDown')}
                    disabled={index === tasks.length - 1}
                    onClick={() => reorder(index, index + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('editor.removeTask')}
                    onClick={() => removeTask(task.id)}
                    style={{ color: 'var(--color-danger)' }}
                  >
                    ✕
                  </button>
                </div>
                <input
                  className="input"
                  dir="ltr"
                  value={task.label.en}
                  placeholder={t('editor.taskEn')}
                  onChange={(e) =>
                    updateTask(task.id, {
                      label: { ...task.label, en: e.target.value },
                    })
                  }
                />
                <input
                  className="input"
                  dir="rtl"
                  value={task.label.ar}
                  placeholder={t('editor.taskAr')}
                  onChange={(e) =>
                    updateTask(task.id, {
                      label: { ...task.label, ar: e.target.value },
                    })
                  }
                />
                <input
                  className="input"
                  dir="rtl"
                  lang="ur"
                  value={task.label.ur ?? ''}
                  placeholder={t('fo.tpl.taskUr', 'Task (Urdu, optional)') ?? ''}
                  onChange={(e) =>
                    updateTask(task.id, {
                      label: { ...task.label, ur: e.target.value },
                    })
                  }
                />
                <div className="row wrap" style={{ gap: 'var(--space-3)' }}>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={task.required}
                      onChange={(e) =>
                        updateTask(task.id, { required: e.target.checked })
                      }
                    />
                    <span>{t('editor.required')}</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={task.photoRequired === true}
                      onChange={(e) =>
                        updateTask(task.id, { photoRequired: e.target.checked })
                      }
                    />
                    <span>{t('fo.task.photoRequired', 'Photo required')}</span>
                  </label>
                  <select
                    className="input"
                    style={{ maxWidth: 220 }}
                    aria-label={t('fo.pd.frequency', 'Frequency') ?? ''}
                    value={task.recurrence ?? 'none'}
                    onChange={(e) => updateTask(task.id, { recurrence: e.target.value as Recurrence })}
                  >
                    {RECURRENCE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r === 'none' ? t('fo.tpl.everyVisit', 'Every visit') : t(recurrenceLabel(r).i18n, recurrenceLabel(r).fallback)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={addTask}
        >
          ＋ {t('editor.addTask')}
        </button>

        {error ? <div className="error-text">{error}</div> : null}
      </main>

      <div className="action-bar">
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          onClick={save}
        >
          {t('common.save')}
        </button>
      </div>
    </AppShell>
  );
}

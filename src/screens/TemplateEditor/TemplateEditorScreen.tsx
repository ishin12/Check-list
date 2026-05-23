import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { useStorage } from '@/app/providers/StorageContext';
import {
  createTask,
  createTemplate,
  moveTask,
  normalizeTaskOrder,
  touchTemplate,
} from '@/domain/template/template';
import type { Task, Template } from '@/domain/models/types';

export function TemplateEditorScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storage = useStorage();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [template, setTemplate] = useState<Template | null>(null);
  const [error, setError] = useState('');

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
    await storage.saveTemplate(touchTemplate(template));
    navigate('/templates');
  };

  return (
    <div className="app-shell">
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
                <label className="row" style={{ gap: 'var(--space-2)' }}>
                  <input
                    type="checkbox"
                    checked={task.required}
                    onChange={(e) =>
                      updateTask(task.id, { required: e.target.checked })
                    }
                  />
                  <span className="hint">{t('editor.required')}</span>
                </label>
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
    </div>
  );
}

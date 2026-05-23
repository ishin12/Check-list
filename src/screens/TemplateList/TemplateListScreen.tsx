import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useStorage } from '@/app/providers/StorageContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { duplicateTemplate, templateTitle } from '@/domain/template/template';
import type { Template } from '@/domain/models/types';

export function TemplateListScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storage = useStorage();
  const { language } = useLanguage();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null);

  const reload = () => storage.listTemplates().then(setTemplates);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  const onDuplicate = async (template: Template) => {
    const suffix = { en: t('templates.copySuffix'), ar: t('templates.copySuffix') };
    await storage.saveTemplate(duplicateTemplate(template, suffix));
    reload();
  };

  const onDelete = async () => {
    if (!pendingDelete) return;
    await storage.deleteTemplate(pendingDelete.id);
    setPendingDelete(null);
    reload();
  };

  return (
    <div className="app-shell">
      <AppHeader title={t('templates.title')} showBack showLanguage />
      <main className="app-main">
        {templates.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">🗂️</div>
            <p>{t('templates.empty')}</p>
            <p className="hint">{t('templates.emptyHint')}</p>
          </div>
        ) : (
          <div className="stack">
            {templates.map((template) => (
              <div key={template.id} className="card">
                <div className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="card__title">
                      {templateTitle(template, language)}
                    </div>
                    <div className="card__meta">
                      {t('templates.tasksCount', { count: template.tasks.length })}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ flex: 1 }}
                    onClick={() => navigate(`/templates/${template.id}`)}
                  >
                    ✏️ {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onDuplicate(template)}
                    aria-label={t('common.duplicate')}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => setPendingDelete(template)}
                    aria-label={t('common.delete')}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <div className="action-bar">
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          onClick={() => navigate('/templates/new')}
        >
          ＋ {t('templates.new')}
        </button>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title={t('templates.deleteConfirm')}
        body={t('templates.deleteConfirmBody')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={onDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { features } from '@/config/features';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useStorage } from '@/app/providers/StorageContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { duplicateTemplate, templateTitle } from '@/domain/template/template';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { configText } from '@/lib/configText';
import type { Template } from '@/domain/models/types';

export function TemplateListScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storage = useStorage();
  const { language } = useLanguage();
  const fd = useFieldData();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pendingOff, setPendingOff] = useState<Template | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Only field checklists (scoped to a project type or stage) when the older
  // task system is hidden (UAT D-34).
  const reload = () => storage.listTemplates().then((list) =>
    setTemplates(features.legacyTasks ? list : list.filter((x) => x.projectTypeId || x.stageId)));
  const shown = templates.filter((x) => showInactive || x.active !== false);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  const onDuplicate = async (template: Template) => {
    const suffix = { en: t('templates.copySuffix'), ar: t('templates.copySuffix') };
    await storage.saveTemplate(duplicateTemplate(template, suffix));
    reload();
  };

  // Checklists are switched off, never deleted (UAT D-32, BR-014).
  const onSwitchOff = async () => {
    if (!pendingOff) return;
    await storage.setTemplateActive(pendingOff.id, false);
    setPendingOff(null);
    reload();
  };

  return (
    <AppShell>
      <AppHeader title={t('templates.title')} showBack />
      <main className="app-main">
        <label className="checkbox-row"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{t('templates.showInactive', 'Show switched-off checklists')}</label>
        {shown.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">🗂️</div>
            <p>{t('templates.empty')}</p>
            <p className="hint">{t('templates.emptyHint')}</p>
          </div>
        ) : (
          <div className="stack">
            {shown.map((template) => (
              <div key={template.id} className="card">
                <div className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="card__title">
                      {templateTitle(template, language)}
                      {template.active === false ? <span className="tag" style={{ marginInlineStart: 8 }}>{t('templates.off', 'Switched off')}</span> : null}
                    </div>
                    <div className="card__meta">
                      {t('templates.tasksCount', { count: template.tasks.length })}
                      {template.projectTypeId ? ` · ${configText(fd.type(template.projectTypeId)?.name, language)}` : ''}
                      {template.stageId ? ` · ${configText(fd.stage(template.stageId)?.name, language)}` : ''}
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
                  {template.active === false ? (
                    <button type="button" className="btn btn--ghost" onClick={async () => { await storage.setTemplateActive(template.id, true); reload(); }}>
                      {t('users.activate', 'Activate')}
                    </button>
                  ) : (
                    <button type="button" className="btn btn--ghost" onClick={() => setPendingOff(template)}>
                      {t('templates.switchOff', 'Switch off')}
                    </button>
                  )}
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
        open={!!pendingOff}
        title={t('templates.switchOffTitle', 'Switch off this checklist?')}
        body={t('templates.switchOffBody', 'It stops appearing on new visits. It is kept with its history and can be switched on again.')}
        confirmLabel={t('templates.switchOff', 'Switch off')}
        onConfirm={onSwitchOff}
        onCancel={() => setPendingOff(null)}
      />
    </AppShell>
  );
}

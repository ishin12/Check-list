import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { useStorage } from '@/app/providers/StorageContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { useCurrentJob } from '@/app/providers/CurrentJobContext';
import { templateTitle } from '@/domain/template/template';
import { startJob } from '@/domain/job/job';
import type { Template } from '@/domain/models/types';

export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storage = useStorage();
  const { language } = useLanguage();
  const { setJob } = useCurrentJob();
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    storage.listTemplates().then(setTemplates);
  }, [storage]);

  const begin = (template: Template) => {
    setJob(startJob(template, language));
    navigate('/job');
  };

  return (
    <div className="app-shell">
      <AppHeader title={t('app.name')} showLanguage />
      <main className="app-main">
        <div className="hero">
          <div className="hero__title">{t('home.start')}</div>
          <div className="hero__desc">{t('home.startDesc')}</div>
        </div>

        <div className="section-title">{t('home.chooseTemplate')}</div>
        {templates.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">📋</div>
            <p>{t('home.noTemplates')}</p>
          </div>
        ) : (
          <div className="stack">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="card card--tap"
                onClick={() => begin(template)}
              >
                <span style={{ fontSize: '1.5rem' }}>✅</span>
                <span style={{ flex: 1 }}>
                  <span className="card__title">
                    {templateTitle(template, language)}
                  </span>
                  <span className="card__meta">
                    {t('templates.tasksCount', { count: template.tasks.length })}
                  </span>
                </span>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {language === 'ar' ? '‹' : '›'}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="stack" style={{ marginTop: 'auto', paddingTop: 'var(--space-4)' }}>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => navigate('/templates')}
          >
            🗂️ {t('home.manageTemplates')}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => navigate('/settings')}
          >
            ⚙️ {t('nav.settings')}
          </button>
        </div>
      </main>
    </div>
  );
}

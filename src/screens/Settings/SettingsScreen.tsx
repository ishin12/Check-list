import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { useLanguage } from '@/app/providers/LanguageContext';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="app-shell">
      <AppHeader title={t('settings.title')} showBack />
      <main className="app-main">
        <div className="card stack">
          <div>
            <div className="card__title">{t('settings.language')}</div>
            <div className="card__meta">{t('settings.languageDesc')}</div>
          </div>
          <div className="row">
            <button
              type="button"
              className={`btn btn--block ${language === 'en' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setLanguage('en')}
            >
              {t('settings.english')}
            </button>
            <button
              type="button"
              className={`btn btn--block ${language === 'ar' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setLanguage('ar')}
            >
              {t('settings.arabic')}
            </button>
          </div>
        </div>

        <div className="card stack">
          <div className="card__title">{t('settings.install')}</div>
          <div className="card__meta">{t('settings.installHint')}</div>
        </div>

        <div className="card stack">
          <div className="card__title">{t('settings.about')}</div>
          <div className="card__meta">{t('settings.aboutDesc')}</div>
        </div>
      </main>
    </div>
  );
}

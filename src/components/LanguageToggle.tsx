import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/app/providers/LanguageContext';

export function LanguageToggle() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <div className="lang-toggle" role="group" aria-label={t('a11y.language', 'Language')}>
      <button
        type="button"
        className={language === 'en' ? 'active' : ''}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        lang="ar"
        className={language === 'ar' ? 'active' : ''}
        onClick={() => setLanguage('ar')}
      >
        ع
      </button>
      <button
        type="button"
        lang="ur"
        className={language === 'ur' ? 'active' : ''}
        onClick={() => setLanguage('ur')}
      >
        اردو
      </button>
    </div>
  );
}

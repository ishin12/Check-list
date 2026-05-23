import { useLanguage } from '@/app/providers/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button
        type="button"
        className={language === 'en' ? 'active' : ''}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={language === 'ar' ? 'active' : ''}
        onClick={() => setLanguage('ar')}
      >
        ع
      </button>
    </div>
  );
}

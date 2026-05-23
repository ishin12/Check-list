import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/app/providers/LanguageContext';
import { LanguageToggle } from './LanguageToggle';

interface Props {
  title: string;
  showBack?: boolean;
  showLanguage?: boolean;
  action?: React.ReactNode;
}

export function AppHeader({ title, showBack, showLanguage, action }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { language } = useLanguage();
  // In RTL the "back" chevron should point the other way.
  const backIcon = language === 'ar' ? '›' : '‹';

  return (
    <header className="app-header">
      {showBack ? (
        <button
          type="button"
          className="icon-btn"
          aria-label={t('nav.back')}
          onClick={() => navigate(-1)}
          style={{ fontSize: '1.75rem', lineHeight: 1 }}
        >
          {backIcon}
        </button>
      ) : null}
      <span className="app-header__title">{title}</span>
      {action}
      {showLanguage ? <LanguageToggle /> : null}
    </header>
  );
}

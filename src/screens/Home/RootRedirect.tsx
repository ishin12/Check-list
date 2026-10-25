import { Navigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';

export function RootRedirect() {
  const { t } = useTranslation();
  const { loading, user, configured } = useAuth();
  if (!configured) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="banner banner--error">
            <Trans i18nKey="setup.notConfigured" components={{ c: <code dir="ltr" /> }} />
          </div>
        </main>
      </div>
    );
  }
  if (loading) return <div className="app-shell"><main className="app-main"><p className="hint">{t('common.loading', 'Loading…')}</p></main></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'client') return <Navigate to="/portal" replace />;
  return <Navigate to="/today" replace />;
}

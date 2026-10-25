import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import type { Role } from '@/domain/models/ops';

interface Props {
  roles: Role[];
  children: ReactNode;
}

export function RoleGate({ roles, children }: Props) {
  const { t } = useTranslation();
  const { loading, user, configured } = useAuth();
  const location = useLocation();

  if (!configured) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="banner banner--error">
            <Trans i18nKey="setup.notConfiguredFull" components={{ c: <code dir="ltr" /> }} />
          </div>
        </main>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="hint">{t('common.loading', 'Loading…')}</p>
        </main>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

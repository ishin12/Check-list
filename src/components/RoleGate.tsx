import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import type { Role } from '@/domain/models/ops';

interface Props {
  roles: Role[];
  /** Also allow anyone holding finance (role or grant). */
  finance?: boolean;
  children: ReactNode;
}

export function RoleGate({ roles, finance, children }: Props) {
  const { loading, user, configured } = useAuth();
  const location = useLocation();

  if (!configured) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="banner banner--error">
            Supabase isn’t configured. Copy <code>.env.example</code> to <code>.env.local</code> and
            set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        </main>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="hint">Loading…</p>
        </main>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  const financeOk = finance && user.active && (user.role === 'finance' || user.financeAccess === true);
  if (!roles.includes(user.role) && !financeOk) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

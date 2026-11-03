import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthContext';

export function AuthCallbackScreen() {
  const { loading, user, refresh } = useAuth();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="hint">Signing you in…</p>
        </main>
      </div>
    );
  }
  return <Navigate to={user ? '/' : '/login'} replace />;
}

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthContext';

export function RootRedirect() {
  const { loading, user, configured } = useAuth();
  if (!configured) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="banner banner--error">
            Supabase isn’t configured. Copy <code>.env.example</code> to <code>.env.local</code>.
          </div>
        </main>
      </div>
    );
  }
  if (loading) return <div className="app-shell"><main className="app-main"><p className="hint">Loading…</p></main></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'client') return <Navigate to="/portal" replace />;
  return <Navigate to="/today" replace />;
}

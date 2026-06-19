import type { ReactNode } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { BottomTabBar } from './BottomTabBar';

interface Props {
  children: ReactNode;
  /** Hide the bottom tab bar (e.g. for full-screen flows like camera capture). */
  bare?: boolean;
}

export function AppShell({ children, bare }: Props) {
  const { user } = useAuth();
  const showTabs = !bare && user && (user.role === 'worker' || user.role === 'manager');
  return (
    <div className={`app-shell${showTabs ? ' app-shell--with-tabs' : ''}`}>
      {children}
      {showTabs ? <BottomTabBar role={user!.role} /> : null}
    </div>
  );
}

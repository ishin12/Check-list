import type { ReactNode } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { BottomTabBar } from './BottomTabBar';
import { SideNav } from './SideNav';

interface Props {
  children: ReactNode;
  /** Hide the bottom tab bar (e.g. for full-screen flows like camera capture). */
  bare?: boolean;
}

export function AppShell({ children, bare }: Props) {
  const { user } = useAuth();
  const showNav = !bare && user && user.role !== 'client';
  return (
    <div className={`app-shell${showNav ? ' app-shell--with-nav' : ''}`}>
      {showNav ? <SideNav /> : null}
      <div className="app-shell__main">{children}</div>
      {showNav ? <BottomTabBar user={user!} /> : null}
    </div>
  );
}

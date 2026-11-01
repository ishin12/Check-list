import type { ReactNode } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { BottomTabBar } from './BottomTabBar';
import { SideNav } from './SideNav';
import { isAdministrator } from '@/domain/permissions';

interface Props {
  children: ReactNode;
  /** Hide the bottom tab bar (e.g. for full-screen flows like camera capture). */
  bare?: boolean;
}

export function AppShell({ children, bare }: Props) {
  const { user } = useAuth();
  const showNav = !bare && user && (user.role === 'worker' || isAdministrator(user.role) || user.role === 'auditor');
  return (
    <div className={`app-shell${showNav ? ' app-shell--with-nav' : ''}`}>
      {showNav ? <SideNav role={user!.role} /> : null}
      <div className="app-shell__main">{children}</div>
      {showNav ? <BottomTabBar role={user!.role} /> : null}
    </div>
  );
}

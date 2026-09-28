import type { Role } from '@/domain/models/ops';
import { features } from '@/config/features';

export interface NavTab {
  to: string;
  i18n: string;
  fallback: string;
  icon: string;
  roles: Role[];
  /** Also shown to managers/supervisors who hold the finance grant. */
  finance?: boolean;
  /** Desktop side rail only (keeps the phone tab bar to five items). */
  sideOnly?: boolean;
}

const FIELD: Role[] = ['supervisor', 'worker', 'manager'];

export const NAV_TABS: NavTab[] = [
  { to: '/field',     i18n: 'tabs.today',     fallback: 'Today',     icon: '◎', roles: FIELD },
  { to: '/projects',  i18n: 'tabs.projects',  fallback: 'Projects',  icon: '⌂', roles: [...FIELD, 'finance'] },
  { to: '/reports',   i18n: 'tabs.reports',   fallback: 'Reports',   icon: '▤', roles: ['manager', 'finance', 'supervisor', 'worker'], finance: true },
  { to: '/labor',     i18n: 'tabs.labor',     fallback: 'Labor',     icon: '⚒', roles: ['manager', 'finance', 'supervisor', 'worker'], finance: true },
  { to: '/month-close', i18n: 'tabs.monthClose', fallback: 'Month close', icon: '▣', roles: ['finance'], finance: true },
  { to: '/employees', i18n: 'tabs.employees', fallback: 'Workers',   icon: '☺', roles: ['manager'], sideOnly: true },
  { to: '/clients',   i18n: 'tabs.clients',   fallback: 'Clients',   icon: '⌖', roles: ['manager'], sideOnly: true },
  { to: '/templates', i18n: 'tabs.templates', fallback: 'Checklists', icon: '☑', roles: ['manager'], sideOnly: true },
  { to: '/config',    i18n: 'tabs.config',    fallback: 'Setup',     icon: '⚙', roles: ['manager'], sideOnly: true },
  { to: '/notifications', i18n: 'tabs.notifications', fallback: 'Inbox', icon: '◉', roles: ['worker', 'manager', 'supervisor'], sideOnly: true },
  { to: '/settings',  i18n: 'tabs.me',        fallback: 'Me',        icon: '☰', roles: [...FIELD, 'finance'] },
];

export interface NavUser { role: Role; financeAccess?: boolean }

/** Tabs for a user; finance-only tabs also appear for anyone granted finance. */
export function tabsFor(user: NavUser, surface: 'side' | 'bottom'): NavTab[] {
  const finance = user.role === 'finance' || user.financeAccess === true;
  return NAV_TABS.filter((tab) => {
    const allowed = tab.roles.includes(user.role) || (finance && tab.finance === true);
    if (!allowed) return false;
    if (tab.to === '/notifications' && !features.legacyTasks) return false;
    if (surface === 'bottom' && tab.sideOnly) return false;
    // Month close lives in the side rail / Me screen for managers with the grant.
    if (surface === 'bottom' && tab.to === '/month-close' && user.role !== 'finance') return false;
    return true;
  });
}

/** @deprecated kept for older callers; use tabsFor. */
export function tabsForRole(role: Role): NavTab[] {
  return tabsFor({ role }, 'side');
}

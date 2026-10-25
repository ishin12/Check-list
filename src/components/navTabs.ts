import type { Role } from '@/domain/models/ops';
import type { IconName } from './Icon';

export interface NavTab {
  to: string;
  i18n: string;
  fallback: string;
  icon: IconName;
  roles: Role[];
}

export const NAV_TABS: NavTab[] = [
  { to: '/today',         i18n: 'tabs.today',         fallback: 'Today',     icon: 'today', roles: ['worker', 'manager'] },
  { to: '/calendar',      i18n: 'tabs.calendar',      fallback: 'Calendar',  icon: 'calendar', roles: ['worker', 'manager'] },
  { to: '/approvals',     i18n: 'tabs.approvals',     fallback: 'Approvals', icon: 'approvals', roles: ['manager'] },
  { to: '/clients',       i18n: 'tabs.clients',       fallback: 'Clients',   icon: 'clients', roles: ['manager'] },
  { to: '/notifications', i18n: 'tabs.notifications', fallback: 'Inbox',     icon: 'inbox', roles: ['worker', 'manager'] },
  { to: '/settings',      i18n: 'tabs.me',            fallback: 'Me',        icon: 'me', roles: ['worker', 'manager'] },
];

export function tabsForRole(role: Role): NavTab[] {
  return NAV_TABS.filter((tab) => tab.roles.includes(role));
}

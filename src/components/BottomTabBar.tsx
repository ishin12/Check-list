import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Role } from '@/domain/models/ops';

interface Tab {
  to: string;
  i18n: string;
  fallback: string;
  icon: string;
  roles: Role[];
}

const TABS: Tab[] = [
  { to: '/today',         i18n: 'tabs.today',         fallback: 'Today',     icon: '◎', roles: ['worker', 'manager'] },
  { to: '/calendar',      i18n: 'tabs.calendar',      fallback: 'Calendar',  icon: '▦', roles: ['worker', 'manager'] },
  { to: '/approvals',     i18n: 'tabs.approvals',     fallback: 'Approvals', icon: '✓', roles: ['manager'] },
  { to: '/clients',       i18n: 'tabs.clients',       fallback: 'Clients',   icon: '⌖', roles: ['manager'] },
  { to: '/notifications', i18n: 'tabs.notifications', fallback: 'Inbox',     icon: '◉', roles: ['worker', 'manager'] },
  { to: '/settings',      i18n: 'tabs.me',            fallback: 'Me',        icon: '☰', roles: ['worker', 'manager'] },
];

export function BottomTabBar({ role }: { role: Role }) {
  const { t } = useTranslation();
  const visible = TABS.filter((tab) => tab.roles.includes(role));
  return (
    <nav className="tab-bar" aria-label="Primary">
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `tab-bar__item${isActive ? ' tab-bar__item--active' : ''}`}
        >
          <span className="tab-bar__icon" aria-hidden>{tab.icon}</span>
          <span className="tab-bar__label">{t(tab.i18n, tab.fallback)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

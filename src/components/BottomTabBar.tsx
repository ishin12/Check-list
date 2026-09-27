import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tabsFor, type NavUser } from './navTabs';

export function BottomTabBar({ user }: { user: NavUser }) {
  const { t } = useTranslation();
  const visible = tabsFor(user, 'bottom');
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

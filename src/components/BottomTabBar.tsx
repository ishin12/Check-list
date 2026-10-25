import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Role } from '@/domain/models/ops';
import { tabsForRole } from './navTabs';
import { Icon } from './Icon';

export function BottomTabBar({ role }: { role: Role }) {
  const { t } = useTranslation();
  const visible = tabsForRole(role);
  return (
    <nav className="tab-bar" aria-label={t('a11y.primaryNav', 'Primary')}>
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `tab-bar__item${isActive ? ' tab-bar__item--active' : ''}`}
        >
          <span className="tab-bar__icon"><Icon name={tab.icon} /></span>
          <span className="tab-bar__label">{t(tab.i18n, tab.fallback)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

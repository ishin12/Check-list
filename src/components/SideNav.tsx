import { NavLink, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Role } from '@/domain/models/ops';
import { useAuth } from '@/app/providers/AuthContext';
import { tabsForRole } from './navTabs';

export function SideNav({ role }: { role: Role }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const visible = tabsForRole(role);

  return (
    <aside className="side-nav" aria-label="Primary">
      <div className="side-nav__brand">
        <span className="side-nav__brand-mark" aria-hidden>◎</span>
        <span className="side-nav__brand-name">{t('app.name', 'Check-list')}</span>
      </div>

      {role === 'manager' ? (
        <Link to="/tasks/new" className="btn btn--primary side-nav__cta">
          <span aria-hidden>+</span>
          <span>{t('calendar.add', 'Add task')}</span>
        </Link>
      ) : null}

      <nav className="side-nav__list">
        {visible.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `side-nav__item${isActive ? ' side-nav__item--active' : ''}`}
          >
            <span className="side-nav__icon" aria-hidden>{tab.icon}</span>
            <span className="side-nav__label">{t(tab.i18n, tab.fallback)}</span>
          </NavLink>
        ))}
      </nav>

      {user ? (
        <div className="side-nav__footer">
          <div className="side-nav__who">
            <div className="side-nav__name">{user.fullName ?? user.email}</div>
            <div className="side-nav__role">{user.role}</div>
          </div>
          <button type="button" className="icon-btn" onClick={signOut} aria-label={t('auth.signOut', 'Sign out')}>
            ↩
          </button>
        </div>
      ) : null}
    </aside>
  );
}

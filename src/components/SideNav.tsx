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
        <span className="side-nav__brand-mark" aria-hidden>
          <svg viewBox="0 0 64 64" width="36" height="36">
            <rect width="64" height="64" rx="10" fill="var(--color-ink)"/>
            <g transform="translate(32 34)" fill="var(--color-brand)">
              <path d="M -2 -2 C -16 -4 -22 -16 -14 -24 C -6 -16 -2 -10 -2 -2 Z"/>
              <path d="M 2 -2 C 16 -4 22 -16 14 -24 C 6 -16 2 -10 2 -2 Z"/>
              <rect x="-1.6" y="-3" width="3.2" height="22" rx="1.6"/>
            </g>
            <path d="M 22 56 Q 32 50 42 56" fill="none" stroke="var(--color-gold)" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </span>
        <span className="side-nav__brand-name">{t('app.name', 'Ghsoon Najd')}</span>
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

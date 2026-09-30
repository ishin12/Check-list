import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { SearchBox, matches } from '@/components/field/SearchBox';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import type { ProjectStatus } from '@/domain/models/ops';
import { configText } from '@/lib/configText';
import { useNames, useRoles } from './common';
import { ErrorBanner } from '@/components/ErrorBanner';

type Filter = ProjectStatus | 'open' | 'all';

/** Projects list (§13): closed projects stay searchable, never deleted (BR-008). */
export function ProjectsScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const fd = useFieldData();
  const names = useNames();
  const { isManager, isSupervisor, user } = useRoles();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [typeId, setTypeId] = useState('');

  const list = useMemo(() => fd.projects
    .filter((p) => !isSupervisor || isManager || p.supervisorId === user?.id)
    // A search looks through every status, so a closed project is always findable (UAT D-37).
    .filter((p) => query.trim() !== '' || filter === 'all' || (filter === 'open' ? p.status === 'active' || p.status === 'on_hold' : p.status === filter))
    .filter((p) => !typeId || p.projectTypeId === typeId)
    .filter((p) => matches(query, p.name, p.code, names.client(p.clientId), names.person(p.supervisorId)))
    .sort((a, b) => a.name.localeCompare(b.name)), [fd.projects, filter, typeId, query, names, isSupervisor, isManager, user?.id]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'open', label: t('fo.projects.open', 'Open') },
    { key: 'active', label: t('fo.status.active', 'Active') },
    { key: 'on_hold', label: t('fo.status.on_hold', 'On hold') },
    { key: 'completed', label: t('fo.status.completed', 'Completed') },
    { key: 'closed', label: t('fo.status.closed', 'Closed') },
    { key: 'all', label: t('fo.all', 'All') },
  ];

  return (
    <AppShell>
      <AppHeader title={t('fo.projects.title', 'Projects')} action={isManager ? (
        <Link to="/projects/new" className="btn btn--primary">＋ {t('fo.projects.new', 'New')}</Link>
      ) : undefined} />
      <main className="app-main">
        <ErrorBanner message={fd.error} />
        <SearchBox value={query} onChange={setQuery} placeholder={t('fo.projects.search', 'Search name, code, client, supervisor') ?? ''} />
        <div className="chips">
          {filters.map((f) => (
            <button key={f.key} type="button" className={`chip${filter === f.key ? ' chip--active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <div className="chips">
          <button type="button" className={`chip${!typeId ? ' chip--active' : ''}`} onClick={() => setTypeId('')}>{t('fo.projects.allTypes', 'All types')}</button>
          {fd.types.filter((x) => x.active).map((ty) => (
            <button key={ty.id} type="button" className={`chip${typeId === ty.id ? ' chip--active' : ''}`} onClick={() => setTypeId(ty.id)}>{configText(ty.name, language)}</button>
          ))}
        </div>
        <div className="card__meta">{t('fo.projects.count', '{{count}} project(s)', { count: list.length })}</div>
        <div className="stack">
          {list.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card card--tap list-link">
              <div className="grow">
                <div className="card__title">{p.name}</div>
                <div className="card__meta">
                  {[p.code, names.client(p.clientId), configText(fd.type(p.projectTypeId)?.name, language),
                    configText(fd.stage(p.stageId)?.name, language)].filter(Boolean).join(' · ')}
                </div>
                <div className="card__meta">{t('fo.projects.supervisor', 'Supervisor')}: {p.supervisorId ? names.person(p.supervisorId) : t('fo.projects.unassigned', 'Unassigned')}</div>
              </div>
              <FieldStatusPill status={p.status} />
            </Link>
          ))}
          {list.length === 0 && fd.ready ? <p className="hint">{t('fo.projects.none', 'No projects match.')}</p> : null}
        </div>
      </main>
    </AppShell>
  );
}

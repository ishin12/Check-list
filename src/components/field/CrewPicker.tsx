import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Employee, LaborDuration } from '@/domain/models/ops';
import { SearchBox, matches } from './SearchBox';

export type CrewSelection = Map<string, LaborDuration>;

interface Props {
  employees: Employee[];
  /** Days already booked per employee on the work date, across all projects. */
  booked: Map<string, number>;
  value: CrewSelection;
  onChange: (next: CrewSelection) => void;
  /** Crew of the previous visit/day on this project, for one-tap copy (§6). */
  previous?: { employeeId: string; duration: LaborDuration }[];
  /** Employees already on this visit (shown as booked, not selectable). */
  onVisit?: Set<string>;
}

/**
 * Multi-select crew with full / half day (§6, §17). Capacity comes from all
 * projects, so a worker already on a full day elsewhere can't be picked
 * (BR-001); the database checks again on save.
 */
export function CrewPicker({ employees, booked, value, onChange, previous, onVisit }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const active = useMemo(() => employees.filter((e) => e.status === 'active'), [employees]);
  const free = (id: string) => Math.max(0, 1 - (booked.get(id) ?? 0));

  const visible = active.filter((e) => matches(query, e.fullName, e.code));
  const selectedDays = [...value.values()].reduce((s, d) => s + d, 0);

  function toggle(e: Employee) {
    const next = new Map(value);
    if (next.has(e.id)) next.delete(e.id);
    else if (free(e.id) > 0) next.set(e.id, free(e.id) >= 1 ? 1 : 0.5);
    onChange(next);
  }

  function setDuration(id: string, d: LaborDuration) {
    const next = new Map(value);
    next.set(id, d);
    onChange(next);
  }

  function copyPrevious() {
    if (!previous) return;
    const next = new Map(value);
    const left: string[] = [];
    for (const p of previous) {
      if (onVisit?.has(p.employeeId)) continue;
      const f = free(p.employeeId);
      const worker = employees.find((e) => e.id === p.employeeId);
      if (f <= 0 || !active.some((e) => e.id === p.employeeId)) {
        // Say who was left out and why, instead of silently copying fewer (UAT D-20).
        left.push(`${worker?.fullName ?? '—'} (${worker?.status !== 'active' ? t('fo.crew.skippedInactive', 'inactive') : t('fo.crew.skippedBooked', 'already booked today')})`);
        continue;
      }
      next.set(p.employeeId, (Math.min(p.duration, f) >= 1 ? 1 : 0.5) as LaborDuration);
    }
    setSkipped(left);
    onChange(next);
  }

  function selectAllFree() {
    const next = new Map(value);
    for (const e of visible) {
      if (onVisit?.has(e.id) || next.has(e.id)) continue;
      const f = free(e.id);
      if (f > 0) next.set(e.id, f >= 1 ? 1 : 0.5);
    }
    onChange(next);
  }

  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 8 }}>
        {previous && previous.length ? (
          <button type="button" className="btn btn--ghost" onClick={copyPrevious}>
            ⟲ {t('fo.crew.copyPrevious', 'Copy last crew')} ({previous.length})
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost" onClick={selectAllFree}>
          {t('fo.crew.selectAll', 'Select all shown')}
        </button>
        {value.size ? (
          <button type="button" className="btn btn--ghost" onClick={() => onChange(new Map())}>
            {t('fo.crew.clear', 'Clear')}
          </button>
        ) : null}
      </div>
      {skipped.length ? (
        <div className="banner banner--warn">{t('fo.crew.skipped', 'Not copied')}: {skipped.join(' · ')}</div>
      ) : null}
      <SearchBox value={query} onChange={setQuery} placeholder={t('fo.crew.search', 'Search workers') ?? ''} />
      <div className="card__meta">
        {t('fo.crew.summary', '{{count}} selected · {{days}} day(s)', { count: value.size, days: selectedDays })}
      </div>
      <div className="crew-list">
        {visible.map((e) => {
          const on = value.has(e.id);
          const f = free(e.id);
          const already = onVisit?.has(e.id);
          const full = f <= 0 || already;
          const bookedDays = booked.get(e.id) ?? 0;
          return (
            <div key={e.id} className={`crew-row${on ? ' crew-row--on' : ''}${full && !on ? ' crew-row--full' : ''}`}>
              <button
                type="button"
                className="row grow"
                style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'start', color: 'inherit' }}
                onClick={() => !already && toggle(e)}
                disabled={full && !on}
                aria-pressed={on}
              >
                <span className="crew-row__check" aria-hidden>{on ? '✓' : ''}</span>
                <span className="crew-row__name">
                  {e.fullName}
                  <div className="crew-row__meta">
                    {[e.code,
                      already ? t('fo.crew.onVisit', 'On this visit')
                        : bookedDays >= 1 ? t('fo.crew.fullElsewhere', 'Full day booked')
                          : bookedDays > 0 ? t('fo.crew.halfFree', 'Half day free') : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </span>
              </button>
              {on ? (
                <div className="dur" role="group" aria-label={t('fo.crew.duration', 'Duration') ?? ''}>
                  <button type="button" className={value.get(e.id) === 1 ? 'dur--on' : ''} disabled={f < 1} onClick={() => setDuration(e.id, 1)}>
                    {t('fo.crew.full', 'Full')}
                  </button>
                  <button type="button" className={value.get(e.id) === 0.5 ? 'dur--on' : ''} onClick={() => setDuration(e.id, 0.5)}>
                    {t('fo.crew.half', 'Half')}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {visible.length === 0 ? <p className="hint">{t('fo.crew.none', 'No active workers match.')}</p> : null}
      </div>
    </div>
  );
}

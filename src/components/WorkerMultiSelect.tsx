import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clearSelection, filterWorkers, selectAllVisible, toggleWorker, type WorkerOption,
} from '@/domain/workerSelect';

interface Props {
  options: WorkerOption[];
  /** Selected worker ids in the order they were picked (first = lead). */
  value: string[];
  onChange: (next: string[]) => void;
}

/** Searchable checkbox list for choosing one or more workers. */
export function WorkerMultiSelect({ options, value, onChange }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const searchId = useId();
  const visible = useMemo(() => filterWorkers(options, query), [options, query]);

  return (
    <div className="worker-select" role="group" aria-label={t('workers.title', 'Workers') ?? 'Workers'}>
      <input
        id={searchId}
        className="input"
        type="search"
        aria-label={t('workers.search', 'Search workers') ?? 'Search workers'}
        value={query}
        placeholder={t('workers.search', 'Search workers') ?? ''}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
      />
      <div className="worker-select__bar">
        <span className="card__meta" aria-live="polite">
          {t('workers.selectedCount', { count: value.length, defaultValue: '{{count}} selected' })}
        </span>
        <span className="worker-select__actions">
          <button
            type="button" className="btn btn--ghost"
            onClick={() => onChange(selectAllVisible(value, visible))}
            disabled={visible.length === 0}
          >
            {t('workers.selectAll', 'Select all')}
          </button>
          <button
            type="button" className="btn btn--ghost"
            onClick={() => onChange(clearSelection())}
            disabled={value.length === 0}
          >
            {t('workers.clear', 'Clear')}
          </button>
        </span>
      </div>
      <ul className="worker-select__list">
        {visible.map((o) => (
          <li key={o.id}>
            <label className="worker-select__item">
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={() => onChange(toggleWorker(value, o.id))}
              />
              <span><bdi>{o.label}</bdi></span>
            </label>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="hint worker-select__empty">{t('workers.noMatches', 'No workers match.')}</li>
        ) : null}
      </ul>
    </div>
  );
}

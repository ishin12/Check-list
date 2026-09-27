import { useTranslation } from 'react-i18next';

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useTranslation();
  return (
    <div className="search">
      <span className="search__icon" aria-hidden>⌕</span>
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder ?? t('fo.search', 'Search') ?? ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder ?? t('fo.search', 'Search') ?? ''}
      />
    </div>
  );
}

/** Case- and accent-insensitive match on any of the given texts. */
export function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((x) => x?.toLowerCase().includes(q));
}

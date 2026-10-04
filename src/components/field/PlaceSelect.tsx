import { useTranslation } from 'react-i18next';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { TARGET_KEY } from '@/domain/reports/reports';
import { configText } from '@/lib/configText';

/** One list for "where": projects, then operational targets (`ot:<id>`) — v2.2. */
export function PlaceSelect({ id, value, onChange, allLabel, openOnly }: {
  id: string; value: string; onChange: (v: string) => void; allLabel: string; openOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const fd = useFieldData();
  const projects = [...fd.projects]
    .filter((p) => !openOnly || p.status === 'active' || p.status === 'on_hold')
    .sort((a, b) => a.name.localeCompare(b.name));
  const targets = fd.targets.filter((o) => !openOnly || o.active);
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      <optgroup label={t('fo.projects.title', 'Projects')}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </optgroup>
      <optgroup label={t('fo.ot.title', 'Operational targets')}>
        {targets.map((o) => <option key={o.id} value={`${TARGET_KEY}${o.id}`}>{configText(o.name, language)}</option>)}
      </optgroup>
    </select>
  );
}

import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/app/providers/LanguageContext';
import type { WorkType } from '@/domain/models/ops';
import { configText } from '@/lib/configText';

/**
 * Work type, chosen once for the whole visit / day (v2.2 §17, §36A) and
 * applied to every worker on it. One tap; the list is managed in Setup.
 */
export function WorkTypePicker({ workTypes, value, onChange, disabled, id = 'work-type' }: {
  workTypes: WorkType[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  // A switched-off type stays visible only where it is already the chosen one.
  const list = workTypes.filter((w) => w.active || w.id === value);
  return (
    <div className="field">
      <span className="field__label" id={`${id}-label`}>{t('fo.wt.label', 'Work type')} *</span>
      <div className="chips" role="radiogroup" aria-labelledby={`${id}-label`}>
        {list.map((w) => (
          <button key={w.id} type="button" role="radio" aria-checked={value === w.id} disabled={disabled}
            className={`chip${value === w.id ? ' chip--active' : ''}`} onClick={() => onChange(w.id)}>
            {configText(w.name, language)}
          </button>
        ))}
      </div>
      {!value ? <div className="hint">{t('fo.wt.choose', 'Choose the work type — it applies to all the workers selected here.')}</div> : null}
    </div>
  );
}

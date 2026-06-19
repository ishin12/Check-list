import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSupabase } from '@/services/supabase/client';
import { useLanguage } from '@/app/providers/LanguageContext';
import type { Task as ChecklistItem, Template, TaskResult } from '@/domain/models/types';

interface Props {
  templateId: string;
  taskId: string;
  initialResults: TaskResult[];
  readOnly?: boolean;
  onChange?: () => void;
}

interface TemplateRow { id: string; title: Template['title']; tasks: ChecklistItem[] }

export function TemplateRunner({ templateId, taskId, initialResults, readOnly, onChange }: Props) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [results, setResults] = useState<TaskResult[]>(initialResults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await getSupabase().from('templates').select('id, title, tasks').eq('id', templateId).maybeSingle();
      if (data) setTemplate(data as TemplateRow);
    })();
  }, [templateId]);

  useEffect(() => { setResults(initialResults); }, [initialResults]);

  const items = useMemo(() => template?.tasks ?? [], [template]);
  const done = results.filter((r) => r.checked).length;

  async function toggle(itemId: string) {
    if (readOnly) return;
    const next = (() => {
      const existing = results.find((r) => r.taskId === itemId);
      if (existing) return results.map((r) => r.taskId === itemId ? { ...r, checked: !r.checked } : r);
      return [...results, { taskId: itemId, checked: true }];
    })();
    setResults(next);
    setSaving(true);
    try {
      await getSupabase().from('tasks').update({ results: next }).eq('id', taskId);
      onChange?.();
    } finally { setSaving(false); }
  }

  if (!template) return null;
  const title = template.title?.[language] ?? template.title?.en ?? '';

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="section-title">{t('runner.title', 'Checklist')} · {title}</span>
        <span className="card__meta">{done}/{items.length}{saving ? ' · saving' : ''}</span>
      </div>
      <div className="stack" style={{ marginTop: 8 }}>
        {items.map((item) => {
          const r = results.find((x) => x.taskId === item.id);
          const checked = !!r?.checked;
          const label = item.label?.[language] ?? item.label?.en ?? '';
          return (
            <button
              key={item.id}
              type="button"
              className={`check-item ${checked ? 'check-item--done' : ''}`}
              onClick={() => toggle(item.id)}
              disabled={readOnly}
              style={{ textAlign: 'start', border: '1px solid var(--color-border)' }}
            >
              <div className="check-item__main">
                <span className={`checkbox ${checked ? 'checkbox--checked' : ''}`} aria-hidden>✓</span>
                <span className="check-item__label">{label}</span>
                {item.required ? <span className="badge">{t('job.requiredBadge', 'Required')}</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

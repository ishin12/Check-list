import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSupabase } from '@/services/supabase/client';
import type { ExtraWorkEntry } from '@/domain/models/ops';

interface Props {
  taskId: string;
  entries: ExtraWorkEntry[];
  canEdit: boolean;
  currentUserId?: string;
  currentUserName?: string;
  /** Optional banner shown above the list when the log is locked. */
  lockedHint?: string;
  onChange?: () => void;
}

export function ExtraWorkLog({
  taskId, entries, canEdit, currentUserId, currentUserName, lockedHint, onChange,
}: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(next: ExtraWorkEntry[]) {
    setSaving(true); setError(null);
    try {
      const { error } = await getSupabase().from('tasks').update({ extra_work: next }).eq('id', taskId);
      if (error) throw error;
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }

  async function add() {
    if (!body.trim() || !currentUserId) return;
    const entry: ExtraWorkEntry = {
      id: crypto.randomUUID(),
      body: body.trim(),
      addedAt: new Date().toISOString(),
      addedBy: currentUserId,
      addedByName: currentUserName,
    };
    await persist([entry, ...entries]);
    setBody('');
  }

  async function remove(id: string) {
    await persist(entries.filter((e) => e.id !== id));
  }

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="section-title">{t('extras.title', 'Extra work done')}</span>
        <span className="card__meta">{entries.length}</span>
      </div>

      {lockedHint ? <div className="hint" style={{ marginTop: 6 }}>{lockedHint}</div> : null}

      <div className="stack" style={{ marginTop: 8 }}>
        {entries.length === 0 ? (
          <p className="hint" style={{ marginBlock: 4 }}>
            {t('extras.empty', 'Nothing extra logged yet.')}
          </p>
        ) : (
          entries.map((e) => {
            const mine = canEdit && e.addedBy === currentUserId;
            return (
              <div key={e.id} className="extra-entry">
                <div style={{ flex: 1 }}>
                  <div>{e.body}</div>
                  <div className="card__meta" style={{ marginTop: 2 }}>
                    {(e.addedByName ?? e.addedBy)} · {new Date(e.addedAt).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                {mine ? (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('extras.remove', 'Remove')}
                    onClick={() => remove(e.id)}
                    disabled={saving}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {canEdit ? (
        <div className="stack" style={{ marginTop: 12 }}>
          <textarea
            className="textarea"
            placeholder={t('extras.placeholder', 'Add something you did off the list…') ?? ''}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error ? <div className="banner banner--error">{error}</div> : null}
          <button className="btn btn--primary" disabled={!body.trim() || saving} onClick={add}>
            {saving ? t('common.saving', 'Saving…') : t('extras.add', 'Add')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

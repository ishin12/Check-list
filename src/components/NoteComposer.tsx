import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSupabase } from '@/services/supabase/client';

interface Props {
  clientId: string;
  taskId?: string;
  onSaved: () => void;
}

export function NoteComposer({ clientId, taskId, onSaved }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!body.trim()) return;
    setSaving(true); setError(null);
    try {
      const { error } = await getSupabase().from('client_notes').insert({
        client_id: clientId,
        body: body.trim(),
        created_in_task_id: taskId ?? null,
      });
      if (error) throw error;
      setBody('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <textarea
        className="textarea"
        placeholder={t('notes.add', 'Leave a note for the next visit…') ?? ''}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error ? <div className="banner banner--error">{error}</div> : null}
      <button className="btn btn--primary" disabled={!body.trim() || saving} onClick={save}>
        {saving ? t('common.saving', 'Saving…') : t('notes.save', 'Save note')}
      </button>
    </div>
  );
}

export async function resolveNote(noteId: string, taskId?: string): Promise<void> {
  const { error } = await getSupabase()
    .from('client_notes')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_in_task_id: taskId ?? null,
    })
    .eq('id', noteId);
  if (error) throw error;
}

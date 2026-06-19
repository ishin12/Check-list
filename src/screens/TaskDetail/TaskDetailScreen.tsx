import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { StatusPill } from '@/components/StatusPill';
import { useAuth } from '@/app/providers/AuthContext';
import { createNextOccurrence, getTask, updateTaskStatus } from '@/services/data/tasks';
import { getSupabase } from '@/services/supabase/client';
import { availableActions, canTransition, proofRequirements, timeOnTaskMinutes } from '@/domain/job/taskFlow';
import { recurrenceLabel } from '@/domain/job/recurrence';
import type { ClientNote, FieldTask, TaskProof } from '@/domain/models/ops';
import { NoteComposer, resolveNote } from '@/components/NoteComposer';

export function TaskDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState<FieldTask | null>(null);
  const [proofs, setProofs] = useState<TaskProof[]>([]);
  const [openNotes, setOpenNotes] = useState<ClientNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState('');

  async function load() {
    if (!id) return;
    try {
      const t = await getTask(id);
      setTask(t);
      if (!t) return;
      const sb = getSupabase();
      const [{ data: ps }, { data: ns }] = await Promise.all([
        sb.from('task_proofs').select('*').eq('task_id', id),
        sb.from('client_notes')
          .select('*').eq('client_id', t.clientId).eq('status', 'open')
          .order('created_at', { ascending: true }),
      ]);
      setProofs((ps ?? []).map(rowToProof));
      setOpenNotes((ns ?? []).map(rowToNote));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (!task) {
    return (
      <AppShell>
        <AppHeader title={t('task.title', 'Task')} showBack />
        <main className="app-main">
          {error ? <div className="banner banner--error">{error}</div> : <p className="hint">Loading…</p>}
        </main>
      </AppShell>
    );
  }

  const role = user?.role ?? 'worker';
  const actions = availableActions(task.status, role);
  const { needsStartProof, needsFinishProof } = proofRequirements(task.status, proofs);

  async function doAction(action: 'start' | 'submit' | 'approve' | 'reject' | 'reopen') {
    if (!task) return;
    const next = canTransition(task.status, action, role);
    if (!next) return;
    if (action === 'start' && needsStartProof) {
      navigate(`/tasks/${task.id}/capture/start`);
      return;
    }
    if (action === 'submit' && needsFinishProof) {
      navigate(`/tasks/${task.id}/capture/finish`);
      return;
    }
    const patch: Record<string, string | null> = { status: next };
    const now = new Date().toISOString();
    if (action === 'start') patch.started_at = now;
    if (action === 'submit') patch.finished_at = now;
    if (action === 'approve' || action === 'reject') {
      patch.decision_at = now;
      patch.decision_note = decisionNote || null;
    }
    await updateTaskStatus(task.id, patch);
    if (action === 'approve' && task.recurrence !== 'none') {
      // Auto-schedule the next visit in this recurring series.
      await createNextOccurrence({ ...task, status: next });
    }
    await load();
  }

  return (
    <AppShell>
      <AppHeader title={task.title} showBack />
      <main className="app-main">
        {error ? <div className="banner banner--error">{error}</div> : null}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="card__meta">
            {new Date(task.scheduledAt).toLocaleString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
          <div className="row" style={{ gap: 6 }}>
            {task.recurrence !== 'none' ? (() => {
              const lbl = recurrenceLabel(task.recurrence);
              return <span className="repeat-pill">↻ {t(lbl.i18n, lbl.fallback)}</span>;
            })() : null}
            <StatusPill status={task.status} />
          </div>
        </div>

        {openNotes.length > 0 ? (
          <section>
            <div className="section-title">📎 {t('notes.openFromBefore', 'Notes left for this visit')}</div>
            <div className="stack">
              {openNotes.map((n) => (
                <div key={n.id} className="note-card">
                  <div>{n.body}</div>
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                    <span className="card__meta">{new Date(n.createdAt).toLocaleDateString()}</span>
                    <button
                      className="btn btn--ghost"
                      onClick={async () => { await resolveNote(n.id, task!.id); await load(); }}
                    >
                      {t('notes.resolve', 'Mark resolved')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="section-title">{t('notes.newForNext', 'Leave a note for next time')}</div>
          <NoteComposer clientId={task.clientId} taskId={task.id} onSaved={load} />
        </section>

        {task.description ? (
          <div className="card">
            <div className="card__title">{t('task.description', 'Description')}</div>
            <p style={{ marginTop: 8 }}>{task.description}</p>
          </div>
        ) : null}

        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="section-title">{t('proof.title', 'Proof')}</span>
            <span className="card__meta">
              {task.startedAt ? `${timeOnTaskMinutes(task)} min` : '—'}
            </span>
          </div>
          <div className="stack" style={{ marginTop: 8 }}>
            <ProofRow kind="start" proofs={proofs} />
            <ProofRow kind="finish" proofs={proofs} />
          </div>
        </section>

        {role === 'manager' && task.status === 'submitted' ? (
          <div className="field">
            <label className="field__label">{t('task.decisionNote', 'Note (optional)')}</label>
            <textarea
              className="textarea"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder={t('task.decisionPlaceholder', 'Add a reason if rejecting…') ?? ''}
            />
          </div>
        ) : null}
      </main>

      {actions.length > 0 ? (
        <div className="action-bar">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              className={`btn btn--block ${a === 'reject' ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => doAction(a)}
            >
              {t(`task.action.${a}`, defaultActionLabel(a))}
            </button>
          ))}
        </div>
      ) : null}
    </AppShell>
  );
}

function defaultActionLabel(a: string): string {
  return ({ start: 'Start', submit: 'Submit', approve: 'Approve', reject: 'Reject', reopen: 'Reopen' } as Record<string, string>)[a] ?? a;
}

function ProofRow({ kind, proofs }: { kind: 'start' | 'finish'; proofs: TaskProof[] }) {
  const found = proofs.find((p) => p.kind === kind);
  return (
    <div className="row">
      <span className={`proof-dot proof-dot--${found ? 'on' : 'off'}`} aria-hidden />
      <span style={{ flex: 1 }}>{kind === 'start' ? 'Start proof' : 'Finish proof'}</span>
      <span className="card__meta">
        {found ? new Date(found.capturedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Missing'}
      </span>
    </div>
  );
}

interface ProofDbRow { id: string; task_id: string; kind: 'start' | 'finish'; storage_path: string; mime: string; captured_at: string; uploaded_at: string; uploaded_by: string | null }
function rowToProof(r: ProofDbRow): TaskProof {
  return {
    id: r.id, taskId: r.task_id, kind: r.kind, storagePath: r.storage_path, mime: r.mime,
    capturedAt: r.captured_at, uploadedAt: r.uploaded_at, uploadedBy: r.uploaded_by ?? undefined,
  };
}

interface NoteRow { id: string; client_id: string; body: string; status: 'open' | 'resolved'; created_at: string; resolved_at: string | null; created_in_task_id: string | null; resolved_in_task_id: string | null; created_by: string | null }
function rowToNote(r: NoteRow): ClientNote {
  return {
    id: r.id, clientId: r.client_id, body: r.body, status: r.status, createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? undefined, createdInTaskId: r.created_in_task_id ?? undefined,
    resolvedInTaskId: r.resolved_in_task_id ?? undefined, createdBy: r.created_by ?? undefined,
  };
}

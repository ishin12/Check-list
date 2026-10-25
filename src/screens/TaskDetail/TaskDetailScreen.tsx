import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { StatusPill } from '@/components/StatusPill';
import { useAuth } from '@/app/providers/AuthContext';
import { createNextOccurrence, getTask, setTaskWorkers, updateTaskLocation, updateTaskStatus } from '@/services/data/tasks';
import { invokeFunction } from '@/services/data/functions';
import { getSupabase } from '@/services/supabase/client';
import { availableActions, canTransition, proofRequirements, timeOnTaskMinutes } from '@/domain/job/taskFlow';
import { recurrenceLabel } from '@/domain/job/recurrence';
import type { ClientNote, FieldTask, TaskProof } from '@/domain/models/ops';
import { NoteComposer, resolveNote } from '@/components/NoteComposer';
import { ProofMedia } from '@/components/ProofMedia';
import { ProofViewer } from '@/components/ProofViewer';
import { useQueuedProofs } from '@/services/media/useQueuedProofs';
import { discardQueued, flushQueue, type QueuedSummary } from '@/services/media/mediaQueue';
import { MEDIA_ERROR_TEXT } from '@/services/media/mediaErrors';
import { TemplateRunner } from '@/components/TemplateRunner';
import { ExtraWorkLog } from '@/components/ExtraWorkLog';
import { TaskWhoLine } from '@/components/TaskWhoLine';
import { ApprovalBadge } from '@/components/ApprovalBadge';
import { WorkerMultiSelect } from '@/components/WorkerMultiSelect';
import { LocationInput, type LocationInputState } from '@/components/LocationInput';
import {
  directionsLinkFor, formatCoords, mapsLinkFor, type TaskLocation,
} from '@/domain/location';
import type { WorkerOption } from '@/domain/workerSelect';

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
  const [requiredItems, setRequiredItems] = useState<{ id: string; label: string }[]>([]);
  const [sendingLink, setSendingLink] = useState(false);
  const [linkResult, setLinkResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);
  const [viewing, setViewing] = useState<TaskProof | null>(null);
  const queued = useQueuedProofs(id);

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

      // Load the template's required items so we can gate Submit.
      if (t.templateId) {
        const { data: tpl } = await sb.from('templates').select('tasks, title').eq('id', t.templateId).maybeSingle();
        const items = ((tpl?.tasks ?? []) as Array<{ id: string; required?: boolean; label: { en: string; ar: string } }>)
          .filter((it) => it.required)
          .map((it) => ({ id: it.id, label: it.label?.en ?? it.label?.ar ?? '—' }));
        setRequiredItems(items);
      } else {
        setRequiredItems([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // When a queued proof finishes uploading it leaves the queue: refresh the proofs.
  const prevQueued = useRef(queued.length);
  useEffect(() => {
    if (queued.length < prevQueued.current) void load();
    prevQueued.current = queued.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued.length]);

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
  // Worker can retake on their own task at any stage; manager can always retake.
  const canEditProofs =
    (role === 'worker' && isOnTask(task, user?.id)) ||
    role === 'manager';
  // Missing required checklist items block Submit.
  const missingRequired = requiredItems.filter(
    (item) => !task.results.find((r) => r.taskId === item.id && r.checked),
  );
  const submitBlocked = missingRequired.length > 0;

  async function doAction(action: 'start' | 'submit' | 'approve' | 'reject' | 'reopen') {
    if (!task) return;
    const next = canTransition(task.status, action, role);
    if (!next) return;
    // The action-bar flow lets the camera auto-advance the status (?auto=1);
    // a direct "Capture"/"Retake" tap on a proof row does not (see MediaCaptureScreen).
    if (action === 'start' && needsStartProof) {
      navigate(`/tasks/${task.id}/capture/start?auto=1`);
      return;
    }
    if (action === 'submit' && submitBlocked) {
      // UI also disables the button, but guard here in case of stale state.
      return;
    }
    if (action === 'submit' && needsFinishProof) {
      navigate(`/tasks/${task.id}/capture/finish?auto=1`);
      return;
    }
    const patch: Record<string, string | null> = { status: next };
    const now = new Date().toISOString();
    if (action === 'start') patch.started_at = now;
    if (action === 'submit') patch.finished_at = now;
    if (action === 'approve' || action === 'reject') {
      patch.decision_at = now;
      patch.decision_note = decisionNote || null;
      if (action === 'approve') patch.approval_method = 'manager';
    }
    await updateTaskStatus(task.id, patch);
    if (action === 'submit') {
      // Send the WhatsApp signing link to the client (awaited — surface failures).
      await sendSigningLink();
    }
    if (action === 'approve' && task.recurrence !== 'none') {
      // Auto-schedule the next visit in this recurring series.
      await createNextOccurrence({ ...task, status: next });
    }
    await load();
  }

  async function sendSigningLink() {
    if (!task) return;
    setSendingLink(true);
    setLinkResult(null);
    try {
      const res = await invokeFunction<{ ok: boolean; sign_url?: string; whatsapp_status?: string; reason?: string }>(
        'send-sign-link', { task_id: task.id },
      );
      if (!res.ok) {
        setLinkResult({ ok: false, message: res.error ?? 'send failed' });
      } else if (res.data?.reason === 'no_phone') {
        setLinkResult({ ok: false, message: t('sign.noPhone', 'No WhatsApp number on file for this client.') });
      } else if (res.data?.whatsapp_status === 'failed') {
        setLinkResult({ ok: false, message: t('sign.deliveryFailed', 'Couldn’t deliver the signing link on WhatsApp.'), url: res.data?.sign_url });
      } else {
        setLinkResult({ ok: true, message: t('sign.linkSent', 'Signing link sent to the client.'), url: res.data?.sign_url });
      }
    } finally {
      setSendingLink(false);
    }
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
            {task.status === 'approved'
              ? <ApprovalBadge approvalMethod={task.approvalMethod} pill />
              : <StatusPill status={task.status} />}
          </div>
        </div>
        <TaskWhoLine task={task} linkClient />
        {role === 'manager' ? <EditWorkers task={task} onSaved={load} /> : null}
        <LocationCard task={task} canEdit={role === 'manager'} onSaved={load} />

        {task.status === 'approved'
          ? <ApprovalBadge approvalMethod={task.approvalMethod} decidedAt={task.decisionAt} note={task.decisionNote} />
          : null}

        {/* Signing-link delivery result after Submit. */}
        {linkResult ? (
          <div className={`banner banner--${linkResult.ok ? 'info' : 'error'}`}>
            <div>{linkResult.message}</div>
            {!linkResult.ok ? (
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn btn--ghost" disabled={sendingLink} onClick={sendSigningLink}>
                  {t('sign.resend', 'Resend link')}
                </button>
                {linkResult.url ? (
                  <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(linkResult.url!)}>
                    {t('sign.copyLink', 'Copy link')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

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

        {/* Manager's decision note for a previously rejected/approved task. */}
        {task.decisionNote && (task.status === 'rejected' || task.status === 'approved') ? (
          <div className={`banner banner--${task.status === 'rejected' ? 'error' : 'success'}`}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {task.status === 'rejected'
                ? t('task.rejectedNote', 'Rejected — manager said:')
                : t('task.approvedNote', 'Approved — manager said:')}
            </div>
            <div>{task.decisionNote}</div>
          </div>
        ) : null}

        {task.templateId ? (
          <TemplateRunner
            templateId={task.templateId}
            taskId={task.id}
            initialResults={task.results}
            readOnly={role === 'client' || task.status === 'approved'}
            onChange={load}
          />
        ) : null}

        <ExtraWorkLog
          taskId={task.id}
          entries={task.extraWork}
          canEdit={
            task.status !== 'approved' &&
            ((role === 'worker' && isOnTask(task, user?.id)) || role === 'manager')
          }
          currentUserId={user?.id}
          currentUserName={user?.fullName ?? user?.email}
          lockedHint={task.status === 'approved' ? t('extras.lockedAfterApproval', 'Locked after approval.') : undefined}
          onChange={load}
        />

        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="section-title">{t('proof.title', 'Proof')}</span>
            <span className="card__meta">
              {task.startedAt ? `${timeOnTaskMinutes(task)} min` : '—'}
            </span>
          </div>
          <div className="stack" style={{ marginTop: 8 }}>
            <ProofRow kind="start"  proofs={proofs} taskId={task.id} canEdit={canEditProofs} queued={queued} onOpen={setViewing} />
            <ProofRow kind="finish" proofs={proofs} taskId={task.id} canEdit={canEditProofs} queued={queued} onOpen={setViewing} />
          </div>
        </section>

        {viewing ? (
          <ProofViewer
            proof={viewing}
            title={viewing.kind === 'start' ? t('proof.start', 'Start proof') : t('proof.finish', 'Finish proof')}
            replaceTo={canEditProofs ? `/tasks/${task.id}/capture/${viewing.kind}?replace=1` : undefined}
            onClose={() => setViewing(null)}
          />
        ) : null}

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

      {submitBlocked && actions.includes('submit') ? (
        <div className="banner banner--info" style={{ margin: '0 var(--space-4) 0' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {t('task.requiredRemaining', 'Complete the required items below before submitting:')}
          </div>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {missingRequired.map((it) => <li key={it.id}>{it.label}</li>)}
          </ul>
        </div>
      ) : null}
      {actions.length > 0 ? (
        <div className="action-bar">
          {actions.map((a) => {
            const disabled = a === 'submit' && submitBlocked;
            return (
              <button
                key={a}
                type="button"
                className={`btn btn--block ${a === 'reject' ? 'btn--danger' : 'btn--primary'}`}
                onClick={() => doAction(a)}
                disabled={disabled}
              >
                {t(`task.action.${a}`, defaultActionLabel(a))}
              </button>
            );
          })}
        </div>
      ) : null}
    </AppShell>
  );
}

/** True when the user is the lead or any assigned worker of the task. */
function isOnTask(task: FieldTask, userId: string | undefined): boolean {
  return !!userId && (task.assignedWorkerId === userId || task.workerIds.includes(userId));
}

/** Manager-only: change the set of workers on a task. */
function EditWorkers({ task, onSaved }: { task: FieldTask; onSaved: () => Promise<void> | void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<WorkerOption[]>([]);
  const [value, setValue] = useState<string[]>(task.workerIds);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function begin() {
    setErr(null);
    setValue(task.workerIds);
    setOpen(true);
    const { data } = await getSupabase()
      .from('profiles').select('id, full_name, email').eq('role', 'worker').eq('active', true);
    setOptions((data ?? []).map((w: { id: string; full_name: string | null; email: string | null }) => ({
      id: w.id, label: w.full_name ?? w.email ?? w.id,
    })));
  }

  async function save() {
    if (value.length === 0) { setErr(t('workers.atLeastOne', 'Select at least one worker.')); return; }
    setSaving(true);
    setErr(null);
    try {
      await setTaskWorkers(task.id, value);
      setOpen(false);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn--ghost" onClick={() => void begin()}>
          {t('workers.edit', 'Edit workers')}
        </button>
      </div>
    );
  }
  return (
    <section className="card worker-edit">
      <div className="section-title">{t('workers.editTitle', 'Edit workers')}</div>
      {err ? <div className="banner banner--error">{err}</div> : null}
      <WorkerMultiSelect options={options} value={value} onChange={setValue} />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn--primary" disabled={saving || value.length === 0} onClick={() => void save()}>
          {saving ? t('common.saving', 'Saving…') : t('workers.save', 'Save workers')}
        </button>
        <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setOpen(false)}>
          {t('workers.cancel', 'Cancel')}
        </button>
      </div>
    </section>
  );
}

/** Maps buttons for everyone (when a location exists); manager-only add/edit. */
function LocationCard({ task, canEdit, onSaved }: { task: FieldTask; canEdit: boolean; onSaved: () => Promise<void> | void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TaskLocation | null>(null);
  const [state, setState] = useState<LocationInputState>('empty');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mapsLink = mapsLinkFor(task);
  const directions = directionsLinkFor(task);
  const hasCoords = typeof task.locationLat === 'number' && typeof task.locationLng === 'number';

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await updateTaskLocation(task.id, draft);
      setOpen(false);
      await onSaved();
    } catch (e) {
      setErr(`${t('location.saveFailed')} ${e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (open) {
    return (
      <section className="card location-card">
        <div className="section-title">{t('location.editTitle')}</div>
        {err ? <div className="banner banner--error">{err}</div> : null}
        <LocationInput
          initial={task}
          disabled={saving}
          onChange={(loc, s) => { setDraft(loc); setState(s); }}
        />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn--primary" disabled={saving || state === 'invalid'} onClick={() => void save()}>
            {saving ? t('common.saving', 'Saving…') : t('location.save')}
          </button>
          <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setOpen(false)}>
            {t('location.cancel')}
          </button>
        </div>
      </section>
    );
  }

  if (!mapsLink && !canEdit) return null;
  return (
    <section className={mapsLink ? 'card location-card' : undefined}>
      {mapsLink ? (
        <>
          <div className="location-card__actions">
            <a className="btn btn--primary" href={mapsLink} target="_blank" rel="noopener noreferrer">
              📍 {t('location.open')}
            </a>
            {directions ? (
              <a className="btn btn--ghost" href={directions} target="_blank" rel="noopener noreferrer">
                {t('location.directions')}
              </a>
            ) : null}
          </div>
          {hasCoords ? (
            <div className="location-card__coords" dir="ltr">
              {formatCoords(task.locationLat as number, task.locationLng as number)}
            </div>
          ) : null}
        </>
      ) : null}
      {canEdit ? (
        <div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => { setErr(null); setDraft(task); setState('valid'); setOpen(true); }}
          >
            {mapsLink ? t('location.edit') : t('location.add')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function defaultActionLabel(a: string): string {
  return ({ start: 'Start', submit: 'Submit', approve: 'Approve', reject: 'Reject', reopen: 'Reopen' } as Record<string, string>)[a] ?? a;
}

function ProofRow({ kind, proofs, taskId, canEdit, queued, onOpen }: {
  kind: 'start' | 'finish'; proofs: TaskProof[]; taskId: string; canEdit: boolean;
  queued: QueuedSummary[]; onOpen: (p: TaskProof) => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const waiting = queued.filter((q) => q.kind === kind);
  // If the worker re-took a proof, the most recent one is what counts.
  const found = proofs
    .filter((p) => p.kind === kind)
    .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0];
  const retakeUrl = `/tasks/${taskId}/capture/${kind}?replace=1`;

  return (
    <div className="proof-block">
      <div className="row" style={{ alignItems: 'center' }}>
        <span className={`proof-dot proof-dot--${found ? 'on' : 'off'}`} aria-hidden />
        <span style={{ flex: 1, fontWeight: 600 }}>
          {kind === 'start' ? 'Start proof' : 'Finish proof'}
        </span>
        <span className="card__meta">
          {found
            ? new Date(found.capturedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            : 'Missing'}
        </span>
        {canEdit && found ? (
          <button type="button" className="btn btn--ghost btn--icon" onClick={() => navigate(retakeUrl)} aria-label="Retake">
            ↻
          </button>
        ) : null}
        {canEdit && !found ? (
          <button type="button" className="btn btn--ghost" onClick={() => navigate(`/tasks/${taskId}/capture/${kind}`)}>
            Capture
          </button>
        ) : null}
      </div>
      {found ? (
        <button
          type="button"
          className="proof-block__media proof-block__open"
          onClick={() => onOpen(found)}
          aria-label={t('photo.open', 'Open full screen') ?? 'Open full screen'}
        >
          <ProofMedia proof={found} thumb />
        </button>
      ) : null}
      {waiting.map((q) => (
        <div
          key={q.id}
          className={`banner banner--${q.lastError ? 'error' : 'info'} upload-note`}
          role={q.lastError ? 'alert' : 'status'}
        >
          <div>
            {q.lastError
              ? `${t('photo.uploadFailed', 'Upload failed')} — ${t(MEDIA_ERROR_TEXT[q.lastError].key, MEDIA_ERROR_TEXT[q.lastError].fallback)}`
              : q.uploading
                ? t('photo.uploadingNow', 'Uploading…')
                : t('photo.waiting', 'Waiting to upload')}
          </div>
          {q.lastError ? (
            <div className="row upload-note__actions">
              <button type="button" className="btn btn--ghost" onClick={() => void flushQueue()}>
                {t('photo.retry', 'Retry')}
              </button>
              {canEdit ? (
                <button type="button" className="btn btn--ghost" onClick={() => void discardQueued(q.id)}>
                  {t('photo.discard', 'Discard')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
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

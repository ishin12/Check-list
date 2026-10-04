import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectTask, TaskPhoto, VisitStatus } from '@/domain/models/ops';
import { answerOnVisit, answerTask, updateTaskNote, voidPhoto, type TaskAnswer } from '@/services/data/fieldOps';
import { saveOptionalItem } from '@/services/data/visitFlow';
import { canCorrectCompleted } from '@/domain/fieldops/fieldOps';
import { friendlyError } from '@/lib/ruleErrors';
import { FieldStatusPill } from './FieldStatusPill';
import { PhotoCapture, PhotoThumb, PhotoViewer } from './Photos';
import { ErrorBanner } from '@/components/ErrorBanner';

interface Props {
  task: ProjectTask;
  label: string;
  photos: TaskPhoto[];
  visitId?: string;
  visitStatus?: VisitStatus;
  /** Supervisor/manager working the visit right now. */
  editable: boolean;
  onChanged: () => void;
}

const ANSWERS: { key: TaskAnswer; label: string }[] = [
  { key: 'done', label: 'Done' },
  { key: 'not_done', label: 'Not done' },
  { key: 'follow_up', label: 'Follow-up' },
];

/** One task on a visit: one tap to answer (§7, §17); photo and note optional unless configured. */
export function TaskItemCard({ task, label, photos, visitId, visitStatus, editable, onChanged }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(task.note ?? '');
  const [showNote, setShowNote] = useState(!!task.note);
  const [viewer, setViewer] = useState<{ url: string; photoId: string; removable: boolean } | null>(null);
  // An optional item is saved the first time it is used (once, even if the
  // supervisor taps twice quickly).
  const saved = useRef<Promise<ProjectTask> | null>(null);
  function savedTask(): Promise<ProjectTask> {
    if (!task.pending) return Promise.resolve(task);
    saved.current ??= saveOptionalItem(task).catch((e) => { saved.current = null; throw e; });
    return saved.current;
  }

  const answer = visitId ? answerOnVisit(task, visitId) : null;
  const locked = task.status === 'completed' && !canCorrectCompleted(task, visitStatus);
  // Carried = already on an earlier visit. A manager's task waiting for its
  // first visit is not "carried from earlier" (UAT D-43).
  const carried = !!visitId && !task.pending && task.status !== 'completed' && answer === null
    && ((!!task.visitId && task.visitId !== visitId) || (!!task.lastVisitId && task.lastVisitId !== visitId));
  const visitPhotos = photos.filter((p) => !visitId || p.visitId === visitId);
  const olderPhotos = photos.filter((p) => visitId && p.visitId !== visitId);
  const stateClass = answer === 'done' || task.status === 'completed' ? 'completed'
    : answer === 'follow_up' || task.status === 'needs_follow_up' ? 'needs_follow_up'
      : answer === 'not_done' ? 'not_done' : 'pending';

  async function choose(a: TaskAnswer) {
    if (!visitId || saving) return;
    setSaving(true); setError(null);
    try {
      // Only a note the supervisor actually wrote now is sent; an earlier visit's
      // note shown in the box is not re-saved under this answer (UAT v2.2).
      const changedNote = showNote && note.trim() !== (task.note ?? '').trim() ? note : undefined;
      await answerTask(await savedTask(), visitId, a, changedNote);
      if (a !== 'done') setShowNote(true);
      onChanged();
    } catch (e) {
      setError(friendlyError(e, t));
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    if ((task.note ?? '') === note.trim()) return;
    setError(null);
    try {
      await updateTaskNote((await savedTask()).id, note);
      onChanged();
    } catch (e) {
      setError(friendlyError(e, t));
    }
  }

  const answerable = editable && !!visitId && visitStatus === 'in_progress';

  return (
    <div className={`task-item task-item--${stateClass}`}>
      <div className="task-item__head">
        <div className="task-item__title">{label}</div>
        {(!answerable || answer === null) && !task.pending ? <FieldStatusPill status={task.status} /> : null}
      </div>
      <div className="task-item__tags">
        {task.required ? <span className="tag">{t('fo.task.required', 'Required')}</span> : <span className="tag">{t('fo.task.optional', 'Optional')}</span>}
        {task.photoRequired ? <span className="tag tag--warn">📷 {t('fo.task.photoRequired', 'Photo required')}</span> : null}
        {task.source === 'recurring' ? <span className="tag tag--brand">↻ {t('fo.task.periodic', 'Periodic')}</span> : null}
        {task.source === 'stage' ? <span className="tag tag--brand">{t('fo.task.stage', 'Stage checklist')}</span> : null}
        {task.source === 'manual' ? <span className="tag">{t('fo.task.manual', 'From manager')}</span> : null}
        {carried ? <span className="tag tag--warn">{t('fo.task.carried', 'Carried from earlier')}</span> : null}
      </div>

      {answerable ? (
        <div className="answers" role="group" aria-label={t('fo.task.answer', 'Answer') ?? ''}>
          {ANSWERS.map((a) => {
            const on = answer === a.key;
            // A follow-up cannot go back to open; completed is final once the visit ends.
            // A follow-up carried from an earlier visit stays one until done (BR-006);
            // one set by mistake on this visit can still be corrected.
            const carriedFollowUp = a.key === 'not_done' && task.status === 'needs_follow_up' && answer !== 'done'
              && task.followUpVisitId !== visitId;
            const disabled = saving || (locked && a.key !== 'done') || carriedFollowUp;
            return (
              <button
                key={a.key}
                type="button"
                className={`answer answer--${a.key}${on ? ' answer--on' : ''}`}
                aria-pressed={on}
                disabled={disabled}
                title={carriedFollowUp ? t('fo.task.followUpStays', 'A follow-up from an earlier visit stays open until it is done.') ?? undefined : undefined}
                onClick={() => void choose(a.key)}
              >
                {t(`fo.answer.${a.key}`, a.label)}
              </button>
            );
          })}
        </div>
      ) : null}

      {answerable && task.status === 'needs_follow_up' && task.followUpVisitId !== visitId && answer !== 'done' ? (
        <div className="card__meta">{t('fo.task.followUpStays', 'A follow-up from an earlier visit stays open until it is done.')}</div>
      ) : null}
      {answerable && showNote ? (
        <textarea
          className="textarea"
          value={note}
          placeholder={t('fo.task.notePlaceholder', 'Note or reason (optional)') ?? ''}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void saveNote()}
        />
      ) : task.note ? <div className="card__meta">📝 {task.note}</div> : null}

      <div className="thumbs">
        {visitPhotos.map((p) => <PhotoThumb key={p.id} photo={p} onOpen={(url) => setViewer({ url, photoId: p.id, removable: answerable })} />)}
        {answerable ? (
          <>
            <PhotoCapture taskId={task.id} resolveTaskId={async () => (await savedTask()).id} projectId={task.projectId} visitId={visitId} kind="before" onUploaded={onChanged} />
            <PhotoCapture taskId={task.id} resolveTaskId={async () => (await savedTask()).id} projectId={task.projectId} visitId={visitId} kind="after" onUploaded={onChanged} />
            {!showNote ? (
              <button type="button" className="thumb-add" onClick={() => setShowNote(true)}>
                <span aria-hidden>✎</span><span>{t('fo.task.note', 'Note')}</span>
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {olderPhotos.length ? (
        <details>
          <summary className="card__meta">{t('fo.task.earlierPhotos', 'Earlier photos')} ({olderPhotos.length})</summary>
          <div className="thumbs" style={{ marginTop: 8 }}>
            {olderPhotos.map((p) => <PhotoThumb key={p.id} photo={p} onOpen={(url) => setViewer({ url, photoId: p.id, removable: false })} />)}
          </div>
        </details>
      ) : null}
      <ErrorBanner message={error} />
      <PhotoViewer url={viewer?.url ?? null} onClose={() => setViewer(null)}
        onRemove={viewer?.removable ? async () => { await voidPhoto(viewer.photoId, t('fo.photo.removedReason', 'Removed by the supervisor on the visit')); onChanged(); } : undefined} />
    </div>
  );
}

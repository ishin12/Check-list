import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectTask, TaskPhoto, VisitStatus } from '@/domain/models/ops';
import { answerOnVisit, answerTask, updateTaskNote, type TaskAnswer } from '@/services/data/fieldOps';
import { canCorrectCompleted } from '@/domain/fieldops/fieldOps';
import { friendlyError } from '@/lib/ruleErrors';
import { FieldStatusPill } from './FieldStatusPill';
import { PhotoCapture, PhotoThumb, PhotoViewer } from './Photos';

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
  const [viewer, setViewer] = useState<string | null>(null);

  const answer = visitId ? answerOnVisit(task, visitId) : null;
  const locked = task.status === 'completed' && !canCorrectCompleted(task, visitStatus);
  const carried = !!visitId && task.visitId !== visitId && task.status !== 'completed' && answer === null;
  const visitPhotos = photos.filter((p) => !visitId || p.visitId === visitId);
  const olderPhotos = photos.filter((p) => visitId && p.visitId !== visitId);
  const stateClass = answer === 'done' || task.status === 'completed' ? 'completed'
    : answer === 'follow_up' || task.status === 'needs_follow_up' ? 'needs_follow_up'
      : answer === 'not_done' ? 'not_done' : 'pending';

  async function choose(a: TaskAnswer) {
    if (!visitId || saving) return;
    setSaving(true); setError(null);
    try {
      await answerTask(task, visitId, a, showNote ? note : undefined);
      if (a !== 'done') setShowNote(true);
      onChanged();
    } catch (e) {
      setError(friendlyError(e, t));
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    if ((task.note ?? '') === note) return;
    setError(null);
    try {
      await updateTaskNote(task.id, note);
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
        {!answerable || answer === null ? <FieldStatusPill status={task.status} /> : null}
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
            const disabled = saving || (locked && a.key !== 'done')
              || (a.key === 'not_done' && task.status === 'needs_follow_up' && answer !== 'done');
            return (
              <button
                key={a.key}
                type="button"
                className={`answer answer--${a.key}${on ? ' answer--on' : ''}`}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => void choose(a.key)}
              >
                {t(`fo.answer.${a.key}`, a.label)}
              </button>
            );
          })}
        </div>
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
        {visitPhotos.map((p) => <PhotoThumb key={p.id} photo={p} onOpen={setViewer} />)}
        {answerable ? (
          <>
            <PhotoCapture taskId={task.id} projectId={task.projectId} visitId={visitId} kind="before" onUploaded={onChanged} />
            <PhotoCapture taskId={task.id} projectId={task.projectId} visitId={visitId} kind="after" onUploaded={onChanged} />
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
            {olderPhotos.map((p) => <PhotoThumb key={p.id} photo={p} onOpen={setViewer} />)}
          </div>
        </details>
      ) : null}
      {error ? <div className="banner banner--error">{error}</div> : null}
      <PhotoViewer url={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

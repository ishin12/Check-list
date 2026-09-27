import { useTranslation } from 'react-i18next';

const LABELS: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  open: 'Open',
  needs_follow_up: 'Follow-up',
  active: 'Active',
  on_hold: 'On hold',
  closed: 'Closed',
  inactive: 'Inactive',
  overdue: 'Overdue',
  not_done: 'Not done',
};

/** Pill for project / visit / task / employee states (§27). */
export function FieldStatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <span className={`status-pill status-pill--${status}`}>
      {t(`fo.status.${status}`, LABELS[status] ?? status)}
    </span>
  );
}

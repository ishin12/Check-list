import { useTranslation } from 'react-i18next';
import type { FieldTaskStatus } from '@/domain/models/ops';

const LABELS: Record<FieldTaskStatus, { i18n: string; fallback: string }> = {
  not_started: { i18n: 'status.notStarted',  fallback: 'Not started' },
  in_progress: { i18n: 'status.inProgress',  fallback: 'In progress' },
  submitted:   { i18n: 'status.submitted',   fallback: 'Submitted'   },
  approved:    { i18n: 'status.approved',    fallback: 'Approved'    },
  rejected:    { i18n: 'status.rejected',    fallback: 'Rejected'    },
};

export function StatusPill({ status }: { status: FieldTaskStatus }) {
  const { t } = useTranslation();
  const { i18n, fallback } = LABELS[status];
  return <span className={`status-pill status-pill--${status}`}>{t(i18n, fallback)}</span>;
}

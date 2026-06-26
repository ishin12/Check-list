import { useTranslation } from 'react-i18next';
import type { ApprovalMethod, FieldTaskStatus } from '@/domain/models/ops';

const LABELS: Record<FieldTaskStatus, { i18n: string; fallback: string }> = {
  not_started: { i18n: 'status.notStarted',  fallback: 'Not started' },
  in_progress: { i18n: 'status.inProgress',  fallback: 'In progress' },
  submitted:   { i18n: 'status.submitted',   fallback: 'Submitted'   },
  approved:    { i18n: 'status.approved',    fallback: 'Approved'    },
  rejected:    { i18n: 'status.rejected',    fallback: 'Rejected'    },
};

interface Props {
  status: FieldTaskStatus;
  /** When approved, distinguishes an auto-approval from a real signature. */
  approvalMethod?: ApprovalMethod;
}

export function StatusPill({ status, approvalMethod }: Props) {
  const { t } = useTranslation();
  // Auto-approved (no client response) gets a distinct outlined gold pill so it
  // never reads like a confirmed signature.
  if (status === 'approved' && approvalMethod === 'auto_no_response') {
    return (
      <span className="status-pill status-pill--auto" title={t('approval.autoFull', 'Auto-approved — client did not respond')}>
        {t('approval.autoShort', 'Approved · no response')}
      </span>
    );
  }
  const { i18n, fallback } = LABELS[status];
  return <span className={`status-pill status-pill--${status}`}>{t(i18n, fallback)}</span>;
}

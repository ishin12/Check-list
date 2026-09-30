import { useTranslation } from 'react-i18next';
import type { ApprovalMethod } from '@/domain/models/ops';
import { APP_TIME_ZONE } from '@/lib/dates';

interface Props {
  approvalMethod?: ApprovalMethod;
  /** Render as a compact pill (for card rows). */
  pill?: boolean;
  /** Render as a full subtitle line (TaskDetail). */
  decidedAt?: string;
  note?: string;
}

/**
 * Distinct visual treatment for the three ways a task reaches "approved".
 * An auto-approval (no client response) must never read like a real signature.
 */
export function ApprovalBadge({ approvalMethod, pill, decidedAt, note }: Props) {
  const { t } = useTranslation();
  const method = approvalMethod ?? 'manager';

  if (pill) {
    if (method === 'auto_no_response') {
      return (
        <span className="status-pill status-pill--auto" title={t('approval.autoFull', 'Response window expired — the client did not sign or reply')}>
          {t('approval.autoShort', 'Expired · not signed')}
        </span>
      );
    }
    return (
      <span className="status-pill status-pill--approved">
        {method === 'client_signature' ? t('approval.signedShort', 'Signed') : t('status.approved', 'Approved')}
      </span>
    );
  }

  // Full subtitle line for TaskDetail.
  const when = decidedAt ? new Date(decidedAt).toLocaleString(undefined, { timeZone: APP_TIME_ZONE,
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';

  if (method === 'auto_no_response') {
    return (
      <div className="approval-line approval-line--auto">
        <span className="approval-line__icon" aria-hidden>●</span>
        <span>{t('approval.autoLine', 'The response window closed on {{when}} without a reply from the client. This is not a signature or an approval by the client.', { when })}</span>
      </div>
    );
  }
  if (method === 'client_signature') {
    return (
      <div className="approval-line approval-line--signed">
        <span className="approval-line__icon" aria-hidden>✓</span>
        <span>{t('approval.signedLine', 'Signed by client on {{when}}', { when })}</span>
      </div>
    );
  }
  return (
    <div className="approval-line approval-line--manager">
      <span className="approval-line__icon" aria-hidden>✓</span>
      <span>{t('approval.managerLine', 'Approved by manager on {{when}}', { when })}{note ? ` — ${note}` : ''}</span>
    </div>
  );
}

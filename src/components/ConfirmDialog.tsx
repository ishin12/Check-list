import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__title">{title}</div>
        {body ? <div className="modal__body">{body}</div> : null}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost btn--block" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`btn btn--block ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

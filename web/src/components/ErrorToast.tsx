import { AlertCircle, Check, X } from 'lucide-react'

interface Props {
  message: string
  onDismiss: () => void
  /** 'info' is a plain confirmation (e.g. "Link copied"); the default is an error. */
  kind?: 'error' | 'info'
  /** Optional shortcut shown next to the message, e.g. "Open" for a live task update. */
  action?: { label: string; onClick: () => void }
}

export function ErrorToast({ message, onDismiss, kind = 'error', action }: Props) {
  return (
    <div className="toast-region" role="region" aria-label="Notifications">
      <div className={`toast toast-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
        {kind === 'error' ? <AlertCircle size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
        <span className="toast-message">{message}</span>
        {action && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={action.onClick}>
            {action.label}
          </button>
        )}
        <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss notification">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

import { AlertCircle, X } from 'lucide-react'

interface Props {
  message: string
  onDismiss: () => void
}

export function ErrorToast({ message, onDismiss }: Props) {
  return (
    <div className="toast-region" role="region" aria-label="Notifications">
      <div className="toast toast-error" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <span className="toast-message">{message}</span>
        <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss notification">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

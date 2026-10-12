import { useEffect, useId, useRef } from 'react'
import type { FormEvent, ReactNode } from 'react'

interface Props {
  title: string
  /** Optional round icon beside the heading (used by destructive confirmations). */
  icon?: ReactNode
  children: ReactNode
  confirmLabel: string
  /** Label shown on the confirm button while `busy`. */
  busyLabel?: string
  busy?: boolean
  confirmDisabled?: boolean
  danger?: boolean
  wide?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Shared modal shell on the native <dialog>: focus trap, Esc and top-layer for free. Esc/backdrop are ignored while busy. */
export function DialogShell({
  title,
  icon,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  confirmDisabled = false,
  danger = false,
  wide = false,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!busy && !confirmDisabled) onConfirm()
  }

  return (
    <dialog
      ref={ref}
      className={`confirm-dialog${wide ? ' dialog-wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault() // let React unmount it instead of the browser closing it behind our back
        if (!busy) onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel() // backdrop click
      }}
    >
      <form onSubmit={submit}>
        <div className="confirm-body">
          {icon && (
            <span className="confirm-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="dialog-main">
            <h2 id={titleId}>{title}</h2>
            <div id={bodyId} className="dialog-content">
              {children}
            </div>
          </div>
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy || confirmDisabled}>
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { DialogShell } from './DialogShell'

interface Props {
  title: string
  message: string
  confirmLabel: string
  /** Shown on the confirm button while the action runs (e.g. with progress). */
  busyLabel?: string
  /** Runs when the user confirms; the dialog stays open and shows a busy state until it settles. */
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/** Destructive-action confirmation. */
export function ConfirmDialog({ title, message, confirmLabel, busyLabel = 'Deleting…', onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title={title}
      icon={<TriangleAlert size={22} />}
      confirmLabel={confirmLabel}
      busyLabel={busyLabel}
      busy={busy}
      danger
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <p>{message}</p>
    </DialogShell>
  )
}

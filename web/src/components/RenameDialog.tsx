import { useEffect, useRef, useState } from 'react'
import { apiErrorMessage, validateName } from '../formatters'
import { DialogShell } from './DialogShell'

interface Props {
  name: string
  isFolder: boolean
  /** Performs the rename; a rejection is shown inline and the dialog stays open. */
  onRename: (newName: string) => Promise<void>
  onCancel: () => void
}

/** Rename prompt, prefilled with the current name (extension left out of the initial selection for files). */
export function RenameDialog({ name: current, isFolder, onRename, onCancel }: Props) {
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const dot = current.lastIndexOf('.')
    input.focus()
    input.setSelectionRange(0, !isFolder && dot > 0 ? dot : current.length)
  }, [current, isFolder])

  const trimmed = name.trim()
  const invalid = validateName(name)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await onRename(trimmed)
    } catch (e) {
      setError(apiErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title={`Rename ${isFolder ? 'folder' : 'file'}`}
      confirmLabel="Rename"
      busyLabel="Renaming…"
      busy={busy}
      confirmDisabled={!!invalid || trimmed === current}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        <span>Name</span>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          disabled={busy}
          autoComplete="off"
          aria-invalid={(name !== current && !!invalid) || !!error}
          aria-describedby="rename-msg"
        />
      </label>
      <p id="rename-msg" className="dialog-error" role="alert">
        {error ?? (name !== current && name !== '' ? invalid : null)}
      </p>
    </DialogShell>
  )
}

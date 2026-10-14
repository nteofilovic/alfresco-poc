import { useState } from 'react'
import type { FolderTemplate } from '../api'
import { apiErrorMessage } from '../formatters'
import { DialogShell } from './DialogShell'

const ILLEGAL = /[\\/*?:"<>|]/

interface Props {
  template: FolderTemplate
  /** Name of the folder the new item will be created in, shown as context. */
  parentName: string
  /** Throws on failure so the dialog can show the API's message inline. */
  onCreate: (name: string) => Promise<void>
  onCancel: () => void
}

/** Asks for the name of a new Client / Property / ... made from an admin-designed folder template. */
export function NewFromTemplateDialog({ template, parentName, onCreate, onCancel }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const illegal = ILLEGAL.test(trimmed)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      await onCreate(trimmed)
    } catch (e) {
      setError(String(e).includes('409') ? `“${trimmed}” already exists here.` : apiErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title={`New ${template.name}`}
      confirmLabel={`Create ${template.name}`}
      busyLabel="Creating…"
      busy={busy}
      confirmDisabled={!trimmed || illegal}
      onConfirm={create}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          aria-invalid={illegal}
          autoFocus
          required
        />
      </label>
      <p className="admin-form-hint">
        Created in “{parentName}”
        {template.folders.length > 0 && <> with {template.folders.map((f) => f.name).join(', ')}</>}.
      </p>
      <p className="dialog-error" role="alert">
        {illegal ? 'A name cannot contain \\ / * ? : " < > |' : error}
      </p>
    </DialogShell>
  )
}

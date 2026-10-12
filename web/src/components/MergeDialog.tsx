import { useState } from 'react'
import { DialogShell } from './DialogShell'

interface Props {
  count: number
  busy: boolean
  onMerge: (fileName: string) => void
  onCancel: () => void
}

/** Asks for the merged file's name; the files are merged in list order. */
export function MergeDialog({ count, busy, onMerge, onCancel }: Props) {
  const [name, setName] = useState('merged-document')
  const trimmed = name.trim()

  return (
    <DialogShell
      title="Merge to PDF"
      confirmLabel="Merge"
      busyLabel="Merging…"
      busy={busy}
      confirmDisabled={!trimmed}
      onConfirm={() => onMerge(trimmed)}
      onCancel={onCancel}
    >
      <p>{count} files will be combined into one PDF, in the order shown in the list.</p>
      <label className="dialog-field">
        <span>File name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="merged-document"
          disabled={busy}
          autoComplete="off"
        />
      </label>
    </DialogShell>
  )
}

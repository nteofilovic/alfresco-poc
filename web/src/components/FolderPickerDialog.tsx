import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Folder } from 'lucide-react'
import { api, type NodeDto } from '../api'
import { DialogShell } from './DialogShell'
import { Spinner } from './Spinner'

export interface Crumb {
  id: string
  name: string
}

interface Props {
  title: string
  confirmLabel: string
  busyLabel: string
  busy: boolean
  /** Top of the browsable tree; nothing above it can be picked. */
  root: Crumb
  /** Folders that can't be entered or chosen (the selected folders, which also rules out their descendants). */
  excludedIds: Set<string>
  /** A folder that can't be the target (the folder the items are already in, for Move). */
  disabledTargetId?: string
  disabledTargetHint?: string
  onConfirm: (targetId: string) => void
  onCancel: () => void
}

/** Lazy folder navigator: loads one level at a time, folders only. */
export function FolderPickerDialog({
  title,
  confirmLabel,
  busyLabel,
  busy,
  root,
  excludedIds,
  disabledTargetId,
  disabledTargetHint,
  onConfirm,
  onCancel,
}: Props) {
  const [trail, setTrail] = useState<Crumb[]>([root])
  const [loaded, setLoaded] = useState<{ id: string; folders: NodeDto[]; error: string | null } | null>(null)
  const here = trail[trail.length - 1]
  const loading = loaded?.id !== here.id
  const folders = loaded?.folders ?? []
  const error = loading ? null : loaded.error

  useEffect(() => {
    let cancelled = false
    api
      .listChildren(here.id)
      .then((children) =>
        children.filter((c) => c.isFolder).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      )
      .then(
        (list) => !cancelled && setLoaded({ id: here.id, folders: list, error: null }),
        (e) => !cancelled && setLoaded({ id: here.id, folders: [], error: String(e) }),
      )
    return () => {
      cancelled = true
    }
  }, [here.id])

  const blocked = here.id === disabledTargetId

  return (
    <DialogShell
      title={title}
      confirmLabel={confirmLabel}
      busyLabel={busyLabel}
      busy={busy}
      confirmDisabled={loading || !!error || blocked}
      wide
      onConfirm={() => onConfirm(here.id)}
      onCancel={onCancel}
    >
      <div className="picker-location">
        <button
          type="button"
          className="icon-button"
          onClick={() => setTrail((t) => t.slice(0, -1))}
          disabled={trail.length < 2 || busy}
          aria-label="Up one level"
          title="Up one level"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <nav aria-label="Destination folder" className="picker-crumbs">
          <ol>
            {trail.map((c, i) => (
              <li key={c.id}>
                {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
                {i === trail.length - 1 ? (
                  <span aria-current="location">{c.name}</span>
                ) : (
                  <button type="button" className="link" onClick={() => setTrail(trail.slice(0, i + 1))} disabled={busy}>
                    {c.name}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <div className="picker-list" aria-busy={loading}>
        {loading ? (
          <div className="picker-status">
            <Spinner size={16} label="Loading folders…" />
          </div>
        ) : error ? (
          <p className="picker-status picker-error" role="alert">
            Couldn’t load folders. {error}
          </p>
        ) : folders.length === 0 ? (
          <p className="picker-status">No subfolders here. You can still choose this folder.</p>
        ) : (
          <ul>
            {folders.map((f) => {
              const excluded = excludedIds.has(f.id)
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className="picker-row"
                    disabled={excluded || busy}
                    onClick={() => setTrail((t) => [...t, { id: f.id, name: f.name }])}
                  >
                    <Folder size={16} aria-hidden="true" />
                    <span className="picker-name">{f.name}</span>
                    {excluded ? <span className="picker-note">selected</span> : <ChevronRight size={15} aria-hidden="true" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="picker-target" aria-live="polite">
        {blocked ? (disabledTargetHint ?? 'This folder can’t be chosen.') : `Target: ${trail.map((c) => c.name).join(' / ')}`}
      </p>
    </DialogShell>
  )
}

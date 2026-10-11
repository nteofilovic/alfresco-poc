import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Folder } from 'lucide-react'
import { api, type NodeDto, type TaskAttachment } from '../api'
import { kindFor } from '../formatters'
import { DialogShell } from './DialogShell'
import { FileIcon } from './FileIcon'
import { Spinner } from './Spinner'

interface Crumb {
  id: string
  name: string
}

interface Props {
  root: Crumb
  /** Documents already attached; they start out ticked. */
  initial: TaskAttachment[]
  onConfirm: (files: TaskAttachment[]) => void
  onCancel: () => void
}

/** Like FolderPickerDialog, but lists files too and lets several be ticked across folders. */
export function AttachmentPickerDialog({ root, initial, onConfirm, onCancel }: Props) {
  const [trail, setTrail] = useState<Crumb[]>([root])
  const [loaded, setLoaded] = useState<{ id: string; items: NodeDto[]; error: string | null } | null>(null)
  const [picked, setPicked] = useState(() => new Map(initial.map((a) => [a.id, a.name])))
  const here = trail[trail.length - 1]
  const loading = loaded?.id !== here.id
  const items = loaded?.items ?? []
  const error = loading ? null : loaded.error

  useEffect(() => {
    let cancelled = false
    api
      .listChildren(here.id)
      .then((children) =>
        children.sort(
          (a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        ),
      )
      .then(
        (list) => !cancelled && setLoaded({ id: here.id, items: list, error: null }),
        (e) => !cancelled && setLoaded({ id: here.id, items: [], error: String(e) }),
      )
    return () => {
      cancelled = true
    }
  }, [here.id])

  function toggle(node: NodeDto) {
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(node.id)) next.delete(node.id)
      else next.set(node.id, node.name)
      return next
    })
  }

  return (
    <DialogShell
      title="Attach documents"
      confirmLabel={picked.size > 0 ? `Attach ${picked.size}` : 'Done'}
      wide
      onConfirm={() => onConfirm([...picked].map(([id, name]) => ({ id, name })))}
      onCancel={onCancel}
    >
      <div className="picker-location">
        <button
          type="button"
          className="icon-button"
          onClick={() => setTrail((t) => t.slice(0, -1))}
          disabled={trail.length < 2}
          aria-label="Up one level"
          title="Up one level"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <nav aria-label="Current folder" className="picker-crumbs">
          <ol>
            {trail.map((c, i) => (
              <li key={c.id}>
                {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
                {i === trail.length - 1 ? (
                  <span aria-current="location">{c.name}</span>
                ) : (
                  <button type="button" className="link" onClick={() => setTrail(trail.slice(0, i + 1))}>
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
            <Spinner size={16} label="Loading…" />
          </div>
        ) : error ? (
          <p className="picker-status picker-error" role="alert">
            Couldn’t load this folder. {error}
          </p>
        ) : items.length === 0 ? (
          <p className="picker-status">This folder is empty.</p>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                {n.isFolder ? (
                  <button
                    type="button"
                    className="picker-row"
                    onClick={() => setTrail((t) => [...t, { id: n.id, name: n.name }])}
                  >
                    <Folder size={16} aria-hidden="true" />
                    <span className="picker-name">{n.name}</span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                ) : (
                  <label className="picker-row picker-file">
                    <input type="checkbox" checked={picked.has(n.id)} onChange={() => toggle(n)} />
                    <FileIcon kind={kindFor(n.name, false)} size={16} />
                    <span className="picker-name">{n.name}</span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="picker-target" aria-live="polite">
        {picked.size === 0 ? 'Tick the documents to attach.' : `${picked.size} selected`}
      </p>
    </DialogShell>
  )
}

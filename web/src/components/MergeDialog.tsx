import { useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import type { NodeDto } from '../api'
import { formatBytes } from '../formatters'
import { DialogShell } from './DialogShell'
import { FileTile } from './FileIcon'
import { ProgressBar } from './ProgressBar'

interface Props {
  /** The selected files in their initial merge order. */
  files: NodeDto[]
  busy: boolean
  onMerge: (fileName: string, orderedIds: string[]) => void
  onCancel: () => void
}

/** Asks for the merged file's name and lets the user set the order the files are combined in. */
export function MergeDialog({ files, busy, onMerge, onCancel }: Props) {
  const [name, setName] = useState('merged-document')
  const [order, setOrder] = useState<NodeDto[]>(files)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const trimmed = name.trim()
  const count = order.length

  function moveTo(from: number, to: number, focus?: 'up' | 'down') {
    if (busy || from === to || to < 0 || to >= order.length) return
    const next = order.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setOrder(next)
    setAnnouncement(`${item.name} moved to position ${to + 1} of ${next.length}`)
    if (focus) {
      // The row re-renders in a new place; hand focus back to the same control (or its twin at the list end).
      requestAnimationFrame(() => {
        const row = listRef.current?.children[to]
        const wanted = row?.querySelector<HTMLButtonElement>(`[data-move="${focus}"]`)
        const other = row?.querySelector<HTMLButtonElement>(`[data-move="${focus === 'up' ? 'down' : 'up'}"]`)
        ;(wanted && !wanted.disabled ? wanted : other)?.focus()
      })
    }
  }

  function endDrag() {
    setDragIndex(null)
    setOverIndex(null)
  }

  function onDragOver(e: DragEvent, index: number) {
    if (dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overIndex !== index) setOverIndex(index)
  }

  function onDrop(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex !== null) moveTo(dragIndex, index)
    endDrag()
  }

  function onRowKeyDown(e: KeyboardEvent, index: number) {
    if (!e.altKey || e.target !== e.currentTarget) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const to = e.key === 'ArrowUp' ? index - 1 : index + 1
      moveTo(index, to)
      requestAnimationFrame(() => (listRef.current?.children[Math.min(Math.max(to, 0), count - 1)] as HTMLElement | undefined)?.focus())
    }
  }

  // Which edge of the hovered row shows the drop line: below when dragging down, above when dragging up.
  function dropClass(index: number) {
    if (dragIndex === null || overIndex !== index || dragIndex === index) return ''
    return index > dragIndex ? ' merge-row-drop-after' : ' merge-row-drop-before'
  }

  return (
    <DialogShell
      title="Merge to PDF"
      confirmLabel="Merge"
      busyLabel="Merging…"
      busy={busy}
      confirmDisabled={!trimmed}
      wide
      onConfirm={() => onMerge(trimmed, order.map((f) => f.id))}
      onCancel={onCancel}
    >
      <p>Drag to set the order. Files are combined top to bottom.</p>
      <ol className={`merge-list${busy ? ' merge-list-busy' : ''}`} ref={listRef} aria-label="Merge order">
        {order.map((file, i) => (
          <li
            key={file.id}
            className={`merge-row${dragIndex === i ? ' merge-row-dragging' : ''}${dropClass(i)}`}
            tabIndex={busy ? -1 : 0}
            draggable={!busy}
            onDragStart={(e) => {
              setDragIndex(i)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', file.name)
            }}
            onDragOver={(e) => onDragOver(e, i)}
            onDrop={(e) => onDrop(e, i)}
            onDragEnd={endDrag}
            onKeyDown={(e) => onRowKeyDown(e, i)}
          >
            <span className="merge-grip" aria-hidden="true">
              <GripVertical size={16} />
            </span>
            <span className="merge-pos" aria-hidden="true">
              {i + 1}
            </span>
            <FileTile name={file.name} isFolder={false} />
            <span className="merge-name" title={file.name}>
              {file.name}
            </span>
            <span className="merge-size">{formatBytes(file.sizeInBytes)}</span>
            <span className="merge-moves">
              <button
                type="button"
                className="merge-move"
                data-move="up"
                aria-label={`Move ${file.name} up`}
                disabled={busy || i === 0}
                onClick={() => moveTo(i, i - 1, 'up')}
              >
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                className="merge-move"
                data-move="down"
                aria-label={`Move ${file.name} down`}
                disabled={busy || i === count - 1}
                onClick={() => moveTo(i, i + 1, 'down')}
              >
                <ChevronDown size={16} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
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
      {/* Space is always reserved so the dialog does not jump when the merge starts. */}
      <div className="dialog-progress" aria-live="polite">
        {busy && (
          <>
            <ProgressBar label={`Merging ${count} files`} />
            <span className="progress-status">
              Converting and combining {count} files… this can take a moment for Word/Excel files.
            </span>
          </>
        )}
      </div>
    </DialogShell>
  )
}

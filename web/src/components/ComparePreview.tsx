import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Download, FileQuestion, TriangleAlert, X } from 'lucide-react'
import { api, type NodeDto } from '../api'
import { formatBytes, formatDate } from '../formatters'
import { FileTile } from './FileIcon'
import { Spinner } from './Spinner'
import { EmptyState } from './EmptyState'

interface Props {
  left: NodeDto
  right: NodeDto
  onClose: () => void
}

type State =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; url: string; contentType: string }

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLInputElement) return target.type !== 'checkbox'
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

/** One side of the comparison. Keyed by node id by the parent, so state starts as loading for each document. */
function ComparePane({ node, side }: { node: NodeDto; side: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    api
      .fetchPreview(node.id)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setState({ status: 'unavailable' })
          return
        }
        objectUrl = URL.createObjectURL(result.blob)
        setState({ status: 'ready', url: objectUrl, contentType: result.contentType })
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: String(err) })
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [node.id])

  const isImage = state.status === 'ready' && state.contentType.startsWith('image/')

  return (
    <section className="compare-pane" aria-label={`${side} document: ${node.name}`}>
      <header className="preview-header">
        <div className="preview-title">
          <FileTile name={node.name} isFolder={node.isFolder} />
          <div className="preview-title-text">
            <p className="preview-name" title={node.name}>
              {node.name}
            </p>
            <p className="preview-meta">
              {formatBytes(node.sizeInBytes)} · Modified {formatDate(node.modifiedAt)}
            </p>
          </div>
        </div>
        <div className="preview-actions">
          <a
            className="icon-button"
            href={api.downloadUrl(node.id)}
            download
            aria-label={`Download ${node.name}`}
            title="Download"
          >
            <Download size={17} aria-hidden="true" />
          </a>
        </div>
      </header>

      <div className="preview-body" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && (
          <div className="preview-status">
            <Spinner size={22} label="Generating preview…" />
          </div>
        )}

        {state.status === 'unavailable' && (
          <EmptyState
            icon={FileQuestion}
            title="No preview available"
            description="This file type can't be previewed. Download it to view the contents."
          />
        )}

        {state.status === 'error' && (
          <EmptyState icon={TriangleAlert} title="Couldn't load preview" description={state.message} />
        )}

        {isImage && (
          <div className="preview-image-scroll">
            <img className="preview-image compare-image" src={state.url} alt={node.name} />
          </div>
        )}

        {state.status === 'ready' && state.contentType === 'application/pdf' && (
          <iframe className="preview-frame" src={`${state.url}#view=FitH`} title={`Preview of ${node.name}`} />
        )}
      </div>
    </section>
  )
}

export function ComparePreview({ left, right, onClose }: Props) {
  const [swapped, setSwapped] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const first = swapped ? right : left
  const second = swapped ? left : right

  // Move focus into the dialog and give it back to the invoker on close.
  useEffect(() => {
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    return () => invoker?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      className="compare-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Compare documents: ${left.name} and ${right.name}`}
      tabIndex={-1}
    >
      <header className="compare-header">
        <h2 className="compare-title">Compare documents</h2>
        <div className="preview-actions">
          <button
            type="button"
            className="compare-swap"
            onClick={() => setSwapped((s) => !s)}
            title="Swap left and right"
          >
            <ArrowLeftRight size={16} aria-hidden="true" />
            Swap
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close comparison (Esc)" title="Close (Esc)">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="compare-grid">
        <ComparePane key={first.id} node={first} side="Left" />
        <ComparePane key={second.id} node={second} side="Right" />
      </div>
    </div>
  )
}

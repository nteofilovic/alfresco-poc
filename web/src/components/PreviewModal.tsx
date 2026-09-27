import { useEffect, useState } from 'react'
import { Download, FileQuestion, TriangleAlert, X } from 'lucide-react'
import { api, type NodeDto } from '../api'
import { formatBytes, formatDate, kindFor } from '../formatters'
import { FileIcon } from './FileIcon'
import { Spinner } from './Spinner'
import { EmptyState } from './EmptyState'

interface Props {
  node: NodeDto
  onClose: () => void
}

type State =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; url: string; contentType: string }

export function PreviewModal({ node, onClose }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    setState({ status: 'loading' })
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div
        className="preview-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${node.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="preview-header">
          <div className="preview-title">
            <FileIcon kind={kindFor(node.name, node.isFolder)} size={20} />
            <div>
              <p className="preview-name">{node.name}</p>
              <p className="preview-meta">
                {formatBytes(node.sizeInBytes)} · Modified {formatDate(node.modifiedAt)}
              </p>
            </div>
          </div>
          <div className="preview-actions">
            <a className="btn btn-secondary" href={api.downloadUrl(node.id)} download>
              <Download size={15} aria-hidden="true" />
              Download
            </a>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close preview">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="preview-body">
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

          {state.status === 'ready' && state.contentType.startsWith('image/') && (
            <img className="preview-image" src={state.url} alt={node.name} />
          )}

          {state.status === 'ready' && state.contentType === 'application/pdf' && (
            <iframe className="preview-frame" src={state.url} title={`Preview of ${node.name}`} />
          )}
        </div>
      </div>
    </div>
  )
}

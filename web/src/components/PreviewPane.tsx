import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileQuestion,
  Maximize2,
  Minimize2,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { api, type NodeDto } from '../api'
import { formatBytes, formatDate, kindFor } from '../formatters'
import { FileIcon } from './FileIcon'
import { Spinner } from './Spinner'
import { EmptyState } from './EmptyState'

interface Props {
  node: NodeDto
  /** Previewable files in the order they are listed. */
  files: NodeDto[]
  /** Share of the content area (viewport minus rail) the pane occupies, 0..1. */
  ratio: number
  onRatioChange: (ratio: number) => void
  /** Focus mode: the pane covers everything, list included. */
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onSelect: (node: NodeDto) => void
  onClose: () => void
}

export const RATIO_MIN = 0.35
export const RATIO_MAX = 0.85
export const RATIO_BALANCED = 0.5
export const RATIO_WIDE = 0.7
const SNAPS = [RATIO_BALANCED, 0.65, RATIO_WIDE]

type State =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; url: string; contentType: string }

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4]

/** 'page' fits the whole image; 'width' fits the pane width times `zoom`. */
type FitMode = 'page' | 'width'

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLInputElement) return target.type !== 'checkbox'
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

export function PreviewPane({ node, files, ratio, onRatioChange, expanded, onExpandedChange, onSelect, onClose }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState<FitMode>('page')
  const paneRef = useRef<HTMLElement>(null)

  const index = files.findIndex((f) => f.id === node.id)
  const prev = index > 0 ? files[index - 1] : null
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    // State resets because App keys this component by node id.
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

  // Non-modal pane: keyboard shortcuts work while the list keeps focus.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (isTypingTarget(e.target)) return
      if (e.key === 'Escape') {
        if (expanded) onExpandedChange(false)
        else onClose()
      } else if ((e.key === 'ArrowDown' || e.key === 'j') && next) {
        e.preventDefault()
        onSelect(next)
      } else if ((e.key === 'ArrowUp' || e.key === 'k') && prev) {
        e.preventDefault()
        onSelect(prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, onSelect, prev, next, expanded, onExpandedChange])

  // On narrow screens the pane is full-screen and takes focus like a dialog would.
  useEffect(() => {
    if (window.matchMedia('(max-width: 900px)').matches) paneRef.current?.focus()
  }, [])

  const startResize = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)
      const railWidth = document.querySelector('.rail')?.getBoundingClientRect().width ?? 0
      const move = (ev: PointerEvent) => {
        let r = (window.innerWidth - ev.clientX) / (window.innerWidth - railWidth)
        r = Math.min(RATIO_MAX, Math.max(RATIO_MIN, r))
        const snap = SNAPS.find((s) => Math.abs(s - r) < 0.02)
        onRatioChange(snap ?? r)
      }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', up)
    },
    [onRatioChange],
  )

  function onResizeKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') onRatioChange(Math.min(RATIO_MAX, ratio + 0.03))
    else if (e.key === 'ArrowRight') onRatioChange(Math.max(RATIO_MIN, ratio - 0.03))
    else if (e.key === 'Enter') toggleWidth()
    else return
    e.preventDefault()
  }

  /** Double-click / Enter on the divider: balanced <-> wide. */
  function toggleWidth() {
    onRatioChange(ratio < 0.6 ? RATIO_WIDE : RATIO_BALANCED)
  }

  const isImage = state.status === 'ready' && state.contentType.startsWith('image/')
  const zoomIndex = ZOOM_STEPS.indexOf(zoom)

  function stepZoom(dir: 1 | -1) {
    if (fit === 'page') {
      setFit('width')
      setZoom(1)
      return
    }
    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + dir))])
  }

  return (
    <aside
      ref={paneRef}
      tabIndex={-1}
      className={`preview-pane${expanded ? ' expanded' : ''}`}
      aria-label={`Preview of ${node.name}`}
    >
      {!expanded && (
        <div
          className="preview-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview. Double-click to switch between balanced and wide."
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={Math.round(RATIO_MIN * 100)}
          aria-valuemax={Math.round(RATIO_MAX * 100)}
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={toggleWidth}
          onKeyDown={onResizeKey}
        />
      )}

      <header className="preview-header">
        <div className="preview-title">
          <FileIcon kind={kindFor(node.name, node.isFolder)} size={20} />
          <div className="preview-title-text">
            <p className="preview-name" title={node.name}>
              {node.name}
            </p>
            <p className="preview-meta">
              {formatBytes(node.sizeInBytes)} · Modified {formatDate(node.modifiedAt)}
              {node.createdByUser ? ` · Created by ${node.createdByUser}` : ' · Created'} {formatDate(node.createdAt)}
            </p>
          </div>
        </div>
        <div className="preview-actions">
          {isImage && (
            <div className="preview-zoom" role="group" aria-label="Image zoom">
              <button
                type="button"
                className={`preview-fit${fit === 'page' ? ' active' : ''}`}
                onClick={() => setFit('page')}
                aria-pressed={fit === 'page'}
                title="Fit whole image"
              >
                Page
              </button>
              <button
                type="button"
                className={`preview-fit${fit === 'width' && zoom === 1 ? ' active' : ''}`}
                onClick={() => {
                  setFit('width')
                  setZoom(1)
                }}
                aria-pressed={fit === 'width' && zoom === 1}
                title="Fit to width"
              >
                Width
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => stepZoom(-1)}
                disabled={fit === 'width' && zoomIndex <= 0}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut size={17} aria-hidden="true" />
              </button>
              <span className="preview-zoom-value" aria-live="polite">
                {fit === 'page' ? 'Fit' : `${Math.round(zoom * 100)}%`}
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={() => stepZoom(1)}
                disabled={fit === 'width' && zoomIndex >= ZOOM_STEPS.length - 1}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn size={17} aria-hidden="true" />
              </button>
            </div>
          )}
          <a className="icon-button" href={api.downloadUrl(node.id)} download aria-label="Download" title="Download">
            <Download size={17} aria-hidden="true" />
          </a>
          <button
            type="button"
            className="icon-button preview-expand"
            onClick={() => onExpandedChange(!expanded)}
            aria-label={expanded ? 'Show document list' : 'Focus mode (hide list)'}
            aria-pressed={expanded}
            title={expanded ? 'Show document list' : 'Focus mode (hide list)'}
          >
            {expanded ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close preview (Esc)" title="Close (Esc)">
            <X size={18} aria-hidden="true" />
          </button>
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
            <img
              className="preview-image"
              src={state.url}
              alt={node.name}
              style={fit === 'page' ? { maxWidth: '100%', maxHeight: '100%' } : { width: `${zoom * 100}%`, maxWidth: 'none' }}
            />
          </div>
        )}

        {state.status === 'ready' && state.contentType === 'application/pdf' && (
          <iframe className="preview-frame" src={`${state.url}#view=FitH`} title={`Preview of ${node.name}`} />
        )}
      </div>

      <footer className="preview-footer">
        <span className="preview-position" aria-live="polite">
          {index >= 0 ? `${index + 1} of ${files.length}` : ''}
        </span>
        <span className="preview-hint">J / K or ↑ ↓ to browse</span>
        <div className="preview-nav">
          <button
            type="button"
            className="icon-button"
            onClick={() => prev && onSelect(prev)}
            disabled={!prev}
            aria-label="Previous document"
            title="Previous (↑ / K)"
          >
            <ChevronUp size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => next && onSelect(next)}
            disabled={!next}
            aria-label="Next document"
            title="Next (↓ / J)"
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>
      </footer>
    </aside>
  )
}

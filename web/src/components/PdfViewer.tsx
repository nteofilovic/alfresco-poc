import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Highlighter,
  Minus,
  PenLine,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  StickyNote as StickyNoteIcon,
  Type,
  Undo2,
} from 'lucide-react'
import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist'
import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import { api, type AnnotationInfo, type StickyNote } from '../api'
import { formatDateTimeFull } from '../formatters'
import { Spinner } from './Spinner'

GlobalWorkerOptions.workerSrc = workerUrl

/** 'note' is Zapis' own tool (pdf.js cannot create sticky notes); the others are pdf.js annotation editors. */
type Tool = 'highlight' | 'text' | 'draw' | 'note'
type EditorTool = Exclude<Tool, 'note'>

const TOOL_MODE: Record<EditorTool, number> = {
  highlight: AnnotationEditorType.HIGHLIGHT,
  text: AnnotationEditorType.FREETEXT,
  draw: AnnotationEditorType.INK,
}

const TOOL_COLOR_PARAM: Record<EditorTool, number> = {
  highlight: AnnotationEditorParamsType.HIGHLIGHT_COLOR,
  text: AnnotationEditorParamsType.FREETEXT_COLOR,
  draw: AnnotationEditorParamsType.INK_COLOR,
}

const TOOL_DEFAULT_COLOR: Record<EditorTool, string> = { highlight: '#ffe14d', text: '#1d4ed8', draw: '#d9480f' }

/** Where the note editor is open, in the coordinates of the stage it is drawn in. */
interface NoteEditor {
  /** Index in `notes` when editing an existing note, null for a new one. */
  index: number | null
  page: number
  x: number
  y: number
  /** Where the editor would like to sit (just below the point), and the point's own top for flipping above it. */
  left: number
  top: number
  anchorTop: number
  text: string
  color: string
}

/** Colours offered for sticky notes (name is the tooltip / accessible label). */
const NOTE_COLORS = [
  { name: 'Yellow', value: '#ffd93b' },
  { name: 'Orange', value: '#ffb347' },
  { name: 'Lime', value: '#b5e655' },
  { name: 'Green', value: '#6fcf97' },
  { name: 'Teal', value: '#4fd1c5' },
  { name: 'Sky', value: '#63b3ed' },
  { name: 'Blue', value: '#7f9cf5' },
  { name: 'Purple', value: '#b794f4' },
  { name: 'Pink', value: '#f687b3' },
  { name: 'Grey', value: '#a0aeb8' },
]
const DEFAULT_NOTE_COLOR = NOTE_COLORS[0].value

/**
 * Notes are stored as fractions of the page in its own orientation (what the server expects). The view can be
 * rotated clockwise by 0/90/180/270, so these convert between the two: to where a note shows on screen, and back.
 */
function toView(x: number, y: number, rotation: number): [number, number] {
  if (rotation === 90) return [1 - y, x]
  if (rotation === 180) return [1 - x, 1 - y]
  if (rotation === 270) return [y, 1 - x]
  return [x, y]
}

function fromView(u: number, v: number, rotation: number): [number, number] {
  if (rotation === 90) return [v, 1 - u]
  if (rotation === 180) return [1 - u, 1 - v]
  if (rotation === 270) return [1 - v, u]
  return [u, v]
}

const EDITOR_MARGIN = 8
const POPUP_MARGIN = 6

interface Props {
  /** Object URL of the PDF to show (the original, or its annotated copy). */
  url: string
  nodeId: string
  /** Only plain PDFs can be annotated, and only in the annotated view; generated previews (Office, TIFF) are read-only. */
  editable: boolean
  /** Revision of the annotations being shown, 0 when there are none yet; the server refuses a save based on an older one. */
  baseRevision: number
  onSaved: (info: AnnotationInfo) => void
}

/** The server answers with JSON {message}; api.ts wraps it as "<status> <text>: <body>". */
function errorText(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err)
  const json = raw.slice(raw.indexOf('{'))
  try {
    return (JSON.parse(json) as { message?: string }).message ?? raw
  } catch {
    return raw
  }
}

export function PdfViewer({ url, nodeId, editable, baseRevision, onSaved }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLFormElement>(null)
  const viewerRef = useRef<PDFViewer | null>(null)
  const busRef = useRef<EventBus | null>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool | null>(null)
  const [colors, setColors] = useState(TOOL_DEFAULT_COLOR)
  // Three independent sources of "something to save": pdf.js storage, the undo stack, and pending strokes.
  const [editsDirty, setEditsDirty] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [notes, setNotes] = useState<StickyNote[]>([])
  const [noteEditor, setNoteEditor] = useState<NoteEditor | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [page, setPage] = useState({ current: 1, total: 0 })
  // What is typed in the page box while it has focus; null shows the current page.
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  // View-only turn of the pages (clockwise degrees); the document itself is never rotated.
  const rotationRef = useRef(0)
  const toolRef = useRef<Tool | null>(null)
  toolRef.current = tool
  // Colour of the last note placed or edited: the next new note starts with it.
  const noteColorRef = useRef(DEFAULT_NOTE_COLOR)
  const notesRef = useRef<StickyNote[]>(notes)
  notesRef.current = notes

  const dirty = editsDirty || canUndo || notes.length > 0

  /** Draws the not-yet-saved notes as markers on the rendered pages (pdf.js owns the page DOM, so this is imperative). */
  const renderMarkers = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.pagesCount === 0) return
    for (let i = 0; i < viewer.pagesCount; i++) {
      const div: HTMLElement | undefined = viewer.getPageView(i)?.div
      if (!div) continue
      div.querySelector(':scope > .zp-notes')?.remove()
      const pageNotes = notesRef.current.map((n, index) => ({ n, index })).filter(({ n }) => n.page === i + 1)
      if (pageNotes.length === 0) continue
      const layer = document.createElement('div')
      layer.className = 'zp-notes'
      for (const { n, index } of pageNotes) {
        const marker = document.createElement('button')
        marker.type = 'button'
        marker.className = 'zp-note'
        const [u, v] = toView(n.x, n.y, rotationRef.current)
        marker.style.left = `${u * 100}%`
        marker.style.top = `${v * 100}%`
        marker.title = n.text
        marker.style.background = n.color
        marker.setAttribute('aria-label', `Note: ${n.text}`)
        marker.dataset.noteIndex = String(index)
        layer.append(marker)
      }
      div.append(layer)
    }
  }, [])

  // Load the document once per url; the viewer instance lives as long as this component.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    const eventBus = new EventBus()
    const linkService = new PDFLinkService({ eventBus })
    const viewer = new PDFViewer({
      container,
      eventBus,
      linkService,
      imageResourcesPath: '/pdfjs-images/',
      annotationEditorMode: editable ? AnnotationEditorType.NONE : AnnotationEditorType.DISABLE,
    })
    linkService.setViewer(viewer)
    viewerRef.current = viewer
    busRef.current = eventBus

    eventBus.on('pagesinit', () => {
      viewer.currentScaleValue = 'page-width'
      setPage({ current: 1, total: viewer.pagesCount })
    })
    eventBus.on('pagechanging', (e: { pageNumber: number }) => setPage((p) => ({ ...p, current: e.pageNumber })))
    eventBus.on('pagerendered', renderMarkers)
    eventBus.on('editingstateschanged', (e: { details: { hasSomethingToUndo?: boolean } }) => {
      if (typeof e.details.hasSomethingToUndo === 'boolean') setCanUndo(e.details.hasSomethingToUndo)
    })

    // pdf.js prints a note's date in the browser locale ("10/19/26, 9:41:33 PM"); show DD.MM.YYYY HH:MM:SS instead.
    // The popups are created and translated by pdf.js after the page renders, so watch for them.
    const formatPopupDates = () => {
      for (const time of container.querySelectorAll<HTMLTimeElement>('time.popupDate')) {
        const date = new Date(time.dateTime)
        if (Number.isNaN(date.getTime())) continue
        time.removeAttribute('data-l10n-id') // otherwise pdf.js' own translation overwrites ours
        const text = formatDateTimeFull(date)
        if (time.textContent !== text) time.textContent = text
      }
    }
    const popupDates = new MutationObserver(formatPopupDates)
    popupDates.observe(container, { childList: true, subtree: true, characterData: true })

    // pdf.js opens a note's popup beside its icon, so near the right or bottom edge it runs off the page and is
    // cut off. Whenever one is shown, nudge it back inside the page and the visible area.
    const keepPopupVisible = (mutations: MutationRecord[]) => {
      for (const { target } of mutations) {
        if (!(target instanceof HTMLElement) || !target.classList.contains('popupAnnotation') || target.hidden) continue
        const page = target.closest<HTMLElement>('.page')
        if (!page) continue
        target.style.translate = '' // measure from where pdf.js put it
        const box = target.getBoundingClientRect()
        const pageBox = page.getBoundingClientRect()
        const view = container.getBoundingClientRect()
        const left = Math.max(pageBox.left, view.left) + POPUP_MARGIN
        const right = Math.min(pageBox.right, view.left + container.clientWidth) - POPUP_MARGIN
        const top = Math.max(pageBox.top, view.top) + POPUP_MARGIN
        const bottom = Math.min(pageBox.bottom, view.top + container.clientHeight) - POPUP_MARGIN
        // Past the far edge first, then back from the near one, so a popup too big for the space starts visible.
        const dx = Math.max(left - box.left, Math.min(0, right - box.right))
        const dy = Math.max(top - box.top, Math.min(0, bottom - box.bottom))
        if (dx !== 0 || dy !== 0) target.style.translate = `${dx}px ${dy}px`
      }
    }
    const popupPlacement = new MutationObserver(keepPopupVisible)
    popupPlacement.observe(container, { attributes: true, attributeFilter: ['hidden'], subtree: true })

    const task = getDocument({ url })
    task.promise
      .then((pdf) => {
        if (cancelled) return
        docRef.current = pdf
        // The typings declare this hook as always null, but pdf.js calls it when an annotation changes.
        ;(pdf.annotationStorage as unknown as { onSetModified: () => void }).onSetModified = () => setEditsDirty(true)
        viewer.setDocument(pdf)
        linkService.setDocument(pdf)
        setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(errorText(err))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      popupDates.disconnect()
      popupPlacement.disconnect()
      void task.destroy()
      viewer.cleanup()
      viewerRef.current = null
      busRef.current = null
      docRef.current = null
    }
  }, [url, editable, renderMarkers])

  useEffect(() => {
    renderMarkers()
  }, [notes, renderMarkers])

  // Pointer handling on the pages: placing/opening notes, and noticing a finished pencil stroke.
  useEffect(() => {
    const container = containerRef.current
    const stage = stageRef.current
    if (!container || !stage) return

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      const stageRect = stage!.getBoundingClientRect()

      const marker = target.closest<HTMLElement>('.zp-note')
      if (marker && editable) {
        const index = Number(marker.dataset.noteIndex)
        const note = notesRef.current[index]
        const rect = marker.getBoundingClientRect()
        setNoteEditor({
          index,
          page: note.page,
          x: note.x,
          y: note.y,
          left: rect.left - stageRect.left,
          top: rect.bottom - stageRect.top + 6,
          anchorTop: rect.top - stageRect.top,
          text: note.text,
          color: note.color,
        })
        return
      }

      if (toolRef.current !== 'note') return
      const pageEl = target.closest<HTMLElement>('.page')
      if (!pageEl) return
      const area = (pageEl.querySelector('.canvasWrapper') ?? pageEl).getBoundingClientRect()
      const u = (e.clientX - area.left) / area.width
      const v = (e.clientY - area.top) / area.height
      if (u < 0 || u > 1 || v < 0 || v > 1) return
      const [x, y] = fromView(u, v, rotationRef.current)
      setNoteEditor({
        index: null,
        page: Number(pageEl.dataset.pageNumber),
        x,
        y,
        left: e.clientX - stageRect.left,
        top: e.clientY - stageRect.top + 12,
        anchorTop: e.clientY - stageRect.top,
        text: '',
        color: noteColorRef.current,
      })
    }

    // pdf.js only registers a stroke once it is committed (tool switch / blur), so note it as pending here.
    function onPointerUp() {
      if (toolRef.current === 'draw') setEditsDirty(true)
    }

    container.addEventListener('click', onClick)
    container.addEventListener('pointerup', onPointerUp)
    return () => {
      container.removeEventListener('click', onClick)
      container.removeEventListener('pointerup', onPointerUp)
    }
  }, [editable])

  // Keep the note editor fully inside the stage: pulled left from the right edge, and flipped above the point
  // when there is no room below. Set on the element (not via style props) so typing doesn't move it again.
  const editorOpen = noteEditor !== null
  const editorLeft = noteEditor?.left
  const editorTop = noteEditor?.top
  const editorAnchor = noteEditor?.anchorTop
  useLayoutEffect(() => {
    const form = editorRef.current
    const stage = stageRef.current
    if (!form || !stage || editorLeft === undefined || editorTop === undefined || editorAnchor === undefined) return
    const room = stage.getBoundingClientRect()
    const box = form.getBoundingClientRect()
    const left = Math.min(Math.max(editorLeft - EDITOR_MARGIN, EDITOR_MARGIN), room.width - box.width - EDITOR_MARGIN)
    const below = editorTop + box.height + EDITOR_MARGIN <= room.height
    const top = below ? editorTop : editorAnchor - box.height - 6
    form.style.left = `${Math.max(EDITOR_MARGIN, left)}px`
    form.style.top = `${Math.min(Math.max(top, EDITOR_MARGIN), Math.max(EDITOR_MARGIN, room.height - box.height - EDITOR_MARGIN))}px`
  }, [editorOpen, editorLeft, editorTop, editorAnchor])

  // Warn before the tab closes with unsaved annotations.
  useEffect(() => {
    if (!dirty) return
    const guard = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])

  function pickTool(next: Tool) {
    const viewer = viewerRef.current
    if (!viewer) return
    const active = tool === next ? null : next
    setTool(active)
    setNoteEditor(null)
    viewer.annotationEditorMode = { mode: active && active !== 'note' ? TOOL_MODE[active] : AnnotationEditorType.NONE }
    if (active && active !== 'note') applyColor(active, colors[active])
  }

  function applyColor(forTool: EditorTool, value: string) {
    busRef.current?.dispatch('switchannotationeditorparams', {
      source: null,
      type: TOOL_COLOR_PARAM[forTool],
      value,
    })
  }

  function changeColor(value: string) {
    if (!tool || tool === 'note') return
    setColors((c) => ({ ...c, [tool]: value }))
    applyColor(tool, value)
  }

  function goToPage(n: number) {
    const viewer = viewerRef.current
    if (viewer && viewer.pagesCount > 0) viewer.currentPageNumber = Math.min(viewer.pagesCount, Math.max(1, n))
  }

  function rotate(delta: 90 | -90) {
    const viewer = viewerRef.current
    if (!viewer) return
    const next = (rotationRef.current + delta + 360) % 360
    rotationRef.current = next
    setNoteEditor(null)
    viewer.pagesRotation = next
    renderMarkers() // pages re-render in the new orientation; markers follow once they do (pagerendered)
  }

  function zoom(factor: number) {
    const viewer = viewerRef.current
    if (viewer) viewer.currentScale = Math.min(4, Math.max(0.4, viewer.currentScale * factor))
  }

  function commitNote() {
    if (!noteEditor) return
    const text = noteEditor.text.trim()
    const { index, page: pageNumber, x, y, color } = noteEditor
    setNoteEditor(null)
    if (!text) return
    noteColorRef.current = color
    setNotes((all) =>
      index === null
        ? [...all, { page: pageNumber, x, y, text, color }]
        : all.map((n, i) => (i === index ? { ...n, text, color } : n)),
    )
  }

  function deleteNote() {
    if (!noteEditor || noteEditor.index === null) return setNoteEditor(null)
    const { index } = noteEditor
    setNoteEditor(null)
    setNotes((all) => all.filter((_, i) => i !== index))
  }

  async function save() {
    const pdf = docRef.current
    const viewer = viewerRef.current
    if (!pdf || !viewer || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // Leaving the current tool commits a stroke that is still being drawn.
      viewer.annotationEditorMode = { mode: AnnotationEditorType.NONE }
      setTool(null)
      // saveDocument() writes the pdf.js annotations into the PDF as standard annotation objects.
      const bytes = await pdf.saveDocument()
      const saved = await api.saveAnnotations(nodeId, bytes, notes, baseRevision)
      onSaved(saved)
    } catch (err) {
      setSaveError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const colorTool = tool && tool !== 'note' ? tool : null

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF tools">
        {editable && (
          <>
            <div className="pdf-tools" role="group" aria-label="Annotation tools">
              <button type="button" className={`icon-button${tool === 'highlight' ? ' active' : ''}`} onClick={() => pickTool('highlight')} aria-pressed={tool === 'highlight'} title="Highlight text">
                <Highlighter size={17} aria-hidden="true" />
              </button>
              <button type="button" className={`icon-button${tool === 'text' ? ' active' : ''}`} onClick={() => pickTool('text')} aria-pressed={tool === 'text'} title="Add text">
                <Type size={17} aria-hidden="true" />
              </button>
              <button type="button" className={`icon-button${tool === 'draw' ? ' active' : ''}`} onClick={() => pickTool('draw')} aria-pressed={tool === 'draw'} title="Draw">
                <PenLine size={17} aria-hidden="true" />
              </button>
              <button type="button" className={`icon-button${tool === 'note' ? ' active' : ''}`} onClick={() => pickTool('note')} aria-pressed={tool === 'note'} title="Add sticky note (click on the page)">
                <StickyNoteIcon size={17} aria-hidden="true" />
              </button>
              {colorTool && (
                <input
                  type="color"
                  className="pdf-color"
                  value={colors[colorTool]}
                  onChange={(e) => changeColor(e.target.value)}
                  aria-label="Annotation colour"
                />
              )}
              <button
                type="button"
                className="icon-button"
                onClick={() => busRef.current?.dispatch('editingaction', { source: null, name: 'undo' })}
                disabled={!canUndo}
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={17} aria-hidden="true" />
              </button>
            </div>
            <button type="button" className="pdf-save" onClick={save} disabled={!dirty || saving}>
              {saving ? <Spinner size={14} label="Saving…" /> : <Save size={15} aria-hidden="true" />}
              Save
            </button>
          </>
        )}
        <div className="pdf-zoom" role="group" aria-label="Pages">
          <button type="button" className="icon-button" onClick={() => goToPage(page.current - 1)} disabled={page.current <= 1} aria-label="Previous page" title="Previous page">
            <ChevronUp size={17} aria-hidden="true" />
          </button>
          <span className="pdf-page">
            <input
              className="pdf-page-input"
              type="text"
              inputMode="numeric"
              aria-label="Page number"
              disabled={page.total === 0}
              value={pageDraft ?? (page.total > 0 ? String(page.current) : '')}
              onFocus={(e) => {
                setPageDraft(String(page.current))
                e.currentTarget.select()
              }}
              onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setPageDraft(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (pageDraft) goToPage(Number(pageDraft))
                  e.currentTarget.blur()
                } else if (e.key === 'Escape') e.currentTarget.blur()
                e.stopPropagation()
              }}
            />
            <span aria-live="polite">/ {page.total}</span>
          </span>
          <button type="button" className="icon-button" onClick={() => goToPage(page.current + 1)} disabled={page.current >= page.total} aria-label="Next page" title="Next page">
            <ChevronDown size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="pdf-zoom" role="group" aria-label="Rotate view">
          <button type="button" className="icon-button" onClick={() => rotate(-90)} aria-label="Rotate left" title="Rotate left (view only)">
            <RotateCcw size={17} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={() => rotate(90)} aria-label="Rotate right" title="Rotate right (view only)">
            <RotateCw size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="pdf-zoom" role="group" aria-label="Zoom">
          <button type="button" className="icon-button" onClick={() => zoom(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
            <Minus size={17} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={() => zoom(1.25)} aria-label="Zoom in" title="Zoom in">
            <Plus size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {saveError && (
        <p className="pdf-error" role="alert">
          {saveError}
        </p>
      )}
      {loadError && (
        <p className="pdf-error" role="alert">
          Couldn't open this PDF: {loadError}
        </p>
      )}

      <div ref={stageRef} className="pdf-stage" aria-busy={loading}>
        {loading && (
          <div className="preview-status">
            <Spinner size={22} label="Opening PDF…" />
          </div>
        )}
        <div ref={containerRef} className={`pdf-container${tool === 'note' ? ' note-mode' : ''}`}>
          <div className="pdfViewer" />
        </div>

        {noteEditor && (
          <form
            ref={editorRef}
            className="pdf-note-editor"
            onSubmit={(e) => {
              e.preventDefault()
              commitNote()
            }}
          >
            <textarea
              autoFocus
              rows={4}
              value={noteEditor.text}
              placeholder="Write a note…"
              aria-label="Note text"
              onChange={(e) => setNoteEditor({ ...noteEditor, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNoteEditor(null)
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitNote()
                e.stopPropagation()
              }}
            />
            <div className="pdf-note-colors" role="radiogroup" aria-label="Note colour">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={noteEditor.color === c.value}
                  aria-label={c.name}
                  title={c.name}
                  className={`pdf-note-color${noteEditor.color === c.value ? ' selected' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setNoteEditor({ ...noteEditor, color: c.value })}
                />
              ))}
            </div>
            <div className="pdf-note-actions">
              {noteEditor.index !== null && (
                <button type="button" className="btn btn-secondary pdf-note-delete" onClick={deleteNote}>
                  Delete
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setNoteEditor(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!noteEditor.text.trim()}>
                {noteEditor.index === null ? 'Add note' : 'Update'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

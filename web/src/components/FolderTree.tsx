import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, House, Settings, SquareCheckBig } from 'lucide-react'
import { api, type Space } from '../api'
import type { View } from './Sidebar'

interface Crumb {
  id: string
  name: string
}

type Children = Crumb[] | 'loading' | 'error'

interface Props {
  view: View
  isAdmin: boolean
  taskBadge: number
  spaces: Space[] | null
  currentSpaceId: string | null
  /** Folders below the open space's document library, root first. */
  path: Crumb[]
  /** Changes whenever the open folder's listing was reloaded, so its subfolders here follow (new, renamed, deleted). */
  refreshKey: unknown
  onNavigate: (view: View) => void
  onOpenAllSpaces: () => void
  /** Opens `space` at `trail` (empty: its document library). */
  onOpen: (space: Space, trail: Crumb[]) => void
}

/**
 * Command-bar layout: the left navigation. Home and tasks on top, then every space as a tree of its folders,
 * loaded one level at a time when expanded. The open folder's branch is expanded and marked.
 */
export function FolderTree({ view, isAdmin, taskBadge, spaces, currentSpaceId, path, refreshKey, onNavigate, onOpenAllSpaces, onOpen }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [children, setChildren] = useState<Map<string, Children>>(new Map())
  const requested = useRef(new Set<string>())

  const currentSpace = spaces?.find((s) => s.id === currentSpaceId) ?? null
  const inSpace = view === 'spaces' && currentSpace !== null
  const currentFolderId = inSpace ? (path.length > 0 ? path[path.length - 1].id : currentSpace.rootId) : null
  const branchKey = inSpace ? [currentSpace.rootId, ...path.map((c) => c.id)].join('/') : ''

  // Whatever is open stays visible: expand its space and every folder above it (adjusted during render).
  const [seenBranch, setSeenBranch] = useState('')
  if (branchKey !== seenBranch) {
    setSeenBranch(branchKey)
    const ids = branchKey ? branchKey.split('/') : []
    if (!ids.every((id) => expanded.has(id))) setExpanded(new Set([...expanded, ...ids]))
  }
  const currentFolderRef = useRef(currentFolderId)
  useEffect(() => {
    currentFolderRef.current = currentFolderId
  }, [currentFolderId])

  function load(id: string) {
    requested.current.add(id)
    setChildren((prev) => new Map(prev).set(id, prev.get(id) && prev.get(id) !== 'error' ? prev.get(id)! : 'loading'))
    api
      .listChildren(id)
      .then((nodes) => {
        const folders = nodes.filter((n) => n.isFolder).map((n) => ({ id: n.id, name: n.name }))
        folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        setChildren((prev) => new Map(prev).set(id, folders))
      })
      .catch(() => setChildren((prev) => new Map(prev).set(id, 'error')))
  }

  useEffect(() => {
    for (const id of expanded) if (!requested.current.has(id)) load(id)
  }, [expanded])

  // The open folder was reloaded: refresh its subfolders if they are already known.
  useEffect(() => {
    const id = currentFolderRef.current
    if (id && requested.current.has(id)) load(id)
  }, [refreshKey])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function row(space: Space, id: string, label: string, trail: Crumb[], depth: number) {
    const open = expanded.has(id)
    const kids = children.get(id)
    const leaf = Array.isArray(kids) && kids.length === 0
    const active = id === currentFolderId
    return (
      <li key={id}>
        <div className={`tree-row${active ? ' active' : ''}${depth === 0 && space.id === currentSpaceId && view === 'spaces' ? ' in-branch' : ''}`} style={{ paddingLeft: 4 + depth * 18 }}>
          {leaf ? (
            <span className="tree-caret" aria-hidden="true" />
          ) : (
            <button
              type="button"
              className="tree-caret"
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
              onClick={() => toggle(id)}
            >
              {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            </button>
          )}
          <button type="button" className="tree-label" aria-current={active ? 'page' : undefined} title={label} onClick={() => onOpen(space, trail)}>
            {label}
          </button>
        </div>
        {open && kids === 'loading' && <p className="tree-note" style={{ paddingLeft: 26 + (depth + 1) * 18 }}>Loading…</p>}
        {open && kids === 'error' && <p className="tree-note" style={{ paddingLeft: 26 + (depth + 1) * 18 }}>Couldn’t load folders</p>}
        {open && Array.isArray(kids) && kids.length > 0 && (
          <ul className="tree-list">{kids.map((k) => row(space, k.id, k.name, [...trail, k], depth + 1))}</ul>
        )}
      </li>
    )
  }

  const link = (target: View, label: string, Icon: typeof House, badge = 0) => (
    <button
      type="button"
      className={`tree-link${view === target ? ' active' : ''}`}
      aria-current={view === target ? 'page' : undefined}
      onClick={() => onNavigate(target)}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      {label}
      {badge > 0 && (
        <span className="tree-badge" aria-label={`${badge} new`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )

  return (
    <nav className="folder-tree" aria-label="Folders">
      {link('home', 'Home', House)}
      {link('tasks', 'My tasks', SquareCheckBig, taskBadge)}
      {isAdmin && link('admin', 'Administration', Settings)}

      <button type="button" className={`tree-group${view === 'spaces' && !currentSpace ? ' active' : ''}`} onClick={onOpenAllSpaces}>
        Spaces
      </button>
      {spaces === null ? (
        <p className="tree-note">Loading…</p>
      ) : spaces.length === 0 ? (
        <p className="tree-note">No spaces yet</p>
      ) : (
        <ul className="tree-list">{spaces.map((s) => row(s, s.rootId, s.title, [], 0))}</ul>
      )}
    </nav>
  )
}

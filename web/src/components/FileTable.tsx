import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Download, Eye, FolderInput, FolderOpen, Pencil, SearchX, Trash2, Upload, UploadCloud } from 'lucide-react'
import type { NodeDto, NodeSortDir, NodeSortKey } from '../api'
import { downloadNodes } from '../download'
import { formatBytes, formatDate, initials, isMemberFolder, isStructureFolder, kindFor, templateOf, typeLabel } from '../formatters'
import { FileIcon, FileTile } from './FileIcon'
import { EmptyState } from './EmptyState'
import { ActionsMenu, type MenuAction } from './ActionsMenu'

type SortKey = NodeSortKey
type SortDir = NodeSortDir

interface Props {
  nodes: NodeDto[]
  loading: boolean
  selected: Set<string>
  /** Row briefly marked as new (e.g. the merged PDF); scrolled into view when set. */
  highlightedId?: string | null
  isSearchView: boolean
  searchQuery: string
  onToggleSelected: (id: string) => void
  onToggleAll: (ids: string[], select: boolean) => void
  /** Admins may select folders too (for bulk copy/move/delete). */
  canSelectFolders: boolean
  onOpenFolder: (node: NodeDto) => void
  /** Search view only: where a hit lives, plus a way to jump there. */
  getLocation?: (node: NodeDto) => string
  onOpenLocation: (node: NodeDto) => void
  /** Shows the file's details panel. */
  onPreview: (node: NodeDto) => void
  activeId: string | null
  /** Reports the listed files in display (sorted) order, for previous/next navigation. */
  onFilesOrdered: (files: NodeDto[]) => void
  /** Display name for a username (owner column). */
  ownerNameOf: (username: string) => string
  /** Name of the folder drops upload into (drop zone copy). */
  folderName: string
  onUploadClick: () => void
  onDelete: (node: NodeDto) => void
  canDeleteFolders: boolean
  /** Admins may rename/copy/move folders; everyone may do so for files. */
  canManageFolders: boolean
  onRename: (node: NodeDto) => void
  onCopy: (node: NodeDto) => void
  onMove: (node: NodeDto) => void
  onDropFiles: (files: File[]) => void
  /**
   * Server-side sort (folder listing): the rows are rendered in the order given and a header click calls
   * `onSortChange`. Omit `onSortChange` (search results) and the table sorts the rows itself.
   */
  sortKey?: SortKey
  sortDir?: SortDir
  onSortChange?: (key: SortKey, dir: SortDir) => void
  /** Rendered directly under the rows (the pager). */
  footer?: ReactNode
  /**
   * How a row shows its type (follows the app style): 'tile' is the coloured extension tile with the type under
   * the name, 'icon' a small line icon with the type in its own column.
   */
  variant?: 'tile' | 'icon'
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'modifiedAt', label: 'Modified' },
  { key: 'owner', label: 'Owner' },
  { key: 'sizeInBytes', label: 'Size' },
]

export function FileTable({
  nodes,
  loading,
  selected,
  highlightedId,
  isSearchView,
  searchQuery,
  onToggleSelected,
  onToggleAll,
  canSelectFolders,
  onOpenFolder,
  getLocation,
  onOpenLocation,
  onPreview,
  activeId,
  onFilesOrdered,
  ownerNameOf,
  folderName,
  onUploadClick,
  onDelete,
  canDeleteFolders,
  canManageFolders,
  onRename,
  onCopy,
  onMove,
  onDropFiles,
  sortKey: sortKeyProp,
  sortDir: sortDirProp,
  onSortChange,
  footer,
  variant = 'tile',
}: Props) {
  const iconRows = variant === 'icon'
  const serverSort = onSortChange !== undefined
  const [localKey, setLocalKey] = useState<SortKey>('name')
  const [localDir, setLocalDir] = useState<SortDir>('asc')
  const sortKey = serverSort ? (sortKeyProp ?? 'name') : localKey
  const sortDir = serverSort ? (sortDirProp ?? 'asc') : localDir
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)

  function toggleSort(key: SortKey) {
    const dir: SortDir = key === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    if (onSortChange) {
      onSortChange(key, dir)
    } else {
      setLocalKey(key)
      setLocalDir(dir)
    }
  }

  const ownerOf = (n: NodeDto) => (n.createdByUser ? ownerNameOf(n.createdByUser) : '')

  const sorted = useMemo(() => {
    if (serverSort) return nodes // already ordered by the server
    const copy = [...nodes]
    copy.sort((a, b) => {
      // Folders always sort before files, regardless of column.
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      } else if (sortKey === 'modifiedAt') {
        cmp = (a.modifiedAt ?? '').localeCompare(b.modifiedAt ?? '')
      } else if (sortKey === 'owner') {
        const owner = (n: NodeDto) => (n.createdByUser ? ownerNameOf(n.createdByUser) : '')
        cmp = owner(a).localeCompare(owner(b), undefined, { sensitivity: 'base' })
      } else {
        cmp = (a.sizeInBytes ?? -1) - (b.sizeInBytes ?? -1)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [nodes, serverSort, sortKey, sortDir, ownerNameOf])

  function rowActions(node: NodeDto): MenuAction[] {
    const actions: MenuAction[] = []
    if (node.isFile) {
      actions.push(
        { key: 'details', label: 'Details', icon: <Eye size={15} aria-hidden="true" />, onSelect: () => onPreview(node) },
        { key: 'download', label: 'Download', icon: <Download size={15} aria-hidden="true" />, onSelect: () => downloadNodes([node.id]) },
      )
    }
    if (node.isFile || canManageFolders || isMemberFolder(node)) {
      const structure = isStructureFolder(node)
      actions.push({
        key: 'rename',
        label: 'Rename',
        icon: <Pencil size={15} aria-hidden="true" />,
        disabled: structure,
        hint: 'Part of the workspace structure',
        onSelect: () => onRename(node),
      })
      // Copy/Move pick a destination relative to the browsed folder, so they're unavailable in search results.
      actions.push(
        {
          key: 'copy',
          label: 'Copy to…',
          icon: <Copy size={15} aria-hidden="true" />,
          disabled: isSearchView,
          hint: 'Open the containing folder to copy',
          onSelect: () => onCopy(node),
        },
        {
          key: 'move',
          label: 'Move to…',
          icon: <FolderInput size={15} aria-hidden="true" />,
          disabled: isSearchView,
          hint: 'Open the containing folder to move',
          onSelect: () => onMove(node),
        },
      )
    }
    if (node.isFile || canDeleteFolders || isMemberFolder(node)) {
      actions.push({
        key: 'delete',
        label: 'Delete',
        icon: <Trash2 size={15} aria-hidden="true" />,
        danger: true,
        onSelect: () => onDelete(node),
      })
    }
    return actions
  }

  const selectable = useMemo(() => sorted.filter((n) => n.isFile || canSelectFolders), [sorted, canSelectFolders])
  const selectedCount = selectable.filter((n) => selected.has(n.id)).length
  const allSelected = selectable.length > 0 && selectedCount === selectable.length
  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected
  }, [selectedCount, allSelected])

  // Keep the active row in view while stepping through documents.
  useEffect(() => {
    if (activeId) document.querySelector('.node-table tr.previewing')?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  useEffect(() => {
    if (highlightedId) document.querySelector('.node-table tr.just-added')?.scrollIntoView({ block: 'nearest' })
  }, [highlightedId, loading])

  useEffect(() => {
    onFilesOrdered(sorted.filter((n) => n.isFile))
  }, [sorted, onFilesOrdered])

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    if (isSearchView) return
    e.preventDefault()
    if (!e.dataTransfer.types.includes('Files')) return
    dragDepth.current += 1
    setDragActive(true)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (isSearchView) return
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (isSearchView) return
    e.preventDefault()
    dragDepth.current = Math.max(dragDepth.current - 1, 0)
    if (dragDepth.current === 0) setDragActive(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    dragDepth.current = 0
    if (isSearchView) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) onDropFiles(files)
  }

  return (
    <div
      className={`file-table-wrap${dragActive ? ' drag-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && !isSearchView && (
        <div className="drop-overlay" aria-hidden="true">
          <UploadCloud size={32} />
          <p>Drop to upload to {folderName}</p>
        </div>
      )}

      <div className="table-scroll">
        <table className="node-table">
          <thead>
            <tr>
              <th className="col-check">
                {!isSearchView && selectable.length > 0 && (
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={allSelected}
                    onChange={() => onToggleAll(selectable.map((n) => n.id), !allSelected)}
                    aria-label="Select all"
                  />
                )}
              </th>
              {COLUMNS.map((col) => [
                <th
                  key={col.key}
                  className={`col-${col.key}`}
                  aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button type="button" className="sort-button" onClick={() => toggleSort(col.key)}>
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUp size={13} aria-hidden="true" />
                      ) : (
                        <ArrowDown size={13} aria-hidden="true" />
                      )
                    ) : (
                      <ArrowUpDown size={13} className="sort-icon-idle" aria-hidden="true" />
                    )}
                  </button>
                </th>,
                // The type column sits right after the name; it is not sortable (the API sorts by name, date, owner, size).
                col.key === 'name' && iconRows && (
                  <th key="type" className="col-type">
                    Type
                  </th>
                ),
              ])}
              <th className="col-actions">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="skeleton-row">
                  <td className="col-check">
                    <div className="skeleton skeleton-checkbox" />
                  </td>
                  <td>
                    <div className="skeleton-name-cell">
                      <div className="skeleton skeleton-tile" />
                      <div className="skeleton skeleton-name" />
                    </div>
                  </td>
                  {iconRows && (
                    <td className="col-type">
                      <div className="skeleton skeleton-text-sm" />
                    </td>
                  )}
                  <td>
                    <div className="skeleton skeleton-text" />
                  </td>
                  <td>
                    <div className="skeleton skeleton-text" />
                  </td>
                  <td>
                    <div className="skeleton skeleton-text-sm" />
                  </td>
                  <td></td>
                </tr>
              ))}

            {!loading &&
              sorted.map((node) => {
                const owner = ownerOf(node)
                const actions = rowActions(node)
                const template = templateOf(node)
                return (
                  <tr
                    key={node.id}
                    className={`${selected.has(node.id) ? 'selected' : ''}${node.id === activeId ? ' previewing' : ''}${node.id === highlightedId ? ' just-added' : ''}`}
                  >
                    <td className="col-check">
                      {(node.isFile || canSelectFolders) && (
                        <input
                          type="checkbox"
                          checked={selected.has(node.id)}
                          onChange={() => onToggleSelected(node.id)}
                          aria-label={`Select ${node.name}`}
                        />
                      )}
                    </td>
                    <td className="col-name">
                      <div className="name-cell">
                        {iconRows ? (
                          <FileIcon kind={kindFor(node.name, node.isFolder)} size={20} />
                        ) : (
                          <FileTile name={node.name} isFolder={node.isFolder} templateInstance={!!template} />
                        )}
                        <div className="name-stack">
                          <button
                            type="button"
                            className="name-link"
                            onClick={() => (node.isFolder ? onOpenFolder(node) : onPreview(node))}
                            aria-current={node.id === activeId ? 'true' : undefined}
                          >
                            {node.name}
                          </button>
                          {getLocation ? (
                            <button
                              type="button"
                              className="search-location"
                              onClick={() => onOpenLocation(node)}
                              title="Open containing folder"
                            >
                              {getLocation(node)}
                            </button>
                          ) : iconRows ? null : (
                            <span className={`name-sub${template ? ' name-sub-template' : ''}`}>
                              {template ?? typeLabel(node.name, node.isFolder)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {iconRows && <td className="col-type">{template ?? typeLabel(node.name, node.isFolder)}</td>}
                    <td className="col-modifiedAt">{formatDate(node.modifiedAt)}</td>
                    <td className="col-owner">
                      {owner ? (
                        <span className="owner">
                          <span className="avatar avatar-muted avatar-xs" aria-hidden="true">
                            {initials(owner)}
                          </span>
                          <span className="owner-name">{owner}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="col-sizeInBytes">{node.isFile ? formatBytes(node.sizeInBytes) : '—'}</td>
                    <td className="col-actions">
                      {actions.length > 0 && (
                        <ActionsMenu iconOnly label={`More actions for ${node.name}`} disabled={false} actions={actions} />
                      )}
                    </td>
                  </tr>
                )
              })}

            {!loading && sorted.length === 0 && (
              <tr className="empty-row">
                <td colSpan={iconRows ? 7 : 6}>
                  {isSearchView ? (
                    <EmptyState
                      icon={SearchX}
                      title="No results found"
                      description={`Nothing matched "${searchQuery}". Try a different search term.`}
                    />
                  ) : (
                    <EmptyState
                      icon={FolderOpen}
                      title="This folder is empty"
                      description="Upload a file, or drop files onto this list."
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {footer}

      {!isSearchView && (
        <button type="button" className="drop-zone" onClick={onUploadClick}>
          <Upload size={18} strokeWidth={1.8} aria-hidden="true" />
          Drop files anywhere to upload to {folderName}
        </button>
      )}
    </div>
  )
}

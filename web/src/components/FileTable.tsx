import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Copy, Download, FolderInput, FolderOpen, Pencil, SearchX, Trash2, UploadCloud } from 'lucide-react'
import { api, type NodeDto } from '../api'
import { formatBytes, formatDate, isStructureFolder, kindFor } from '../formatters'
import { FileIcon } from './FileIcon'
import { EmptyState } from './EmptyState'
import { ActionsMenu, type MenuAction } from './ActionsMenu'

type SortKey = 'name' | 'createdAt' | 'modifiedAt' | 'sizeInBytes'
type SortDir = 'asc' | 'desc'

interface Props {
  nodes: NodeDto[]
  loading: boolean
  selected: Set<string>
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
  onPreview: (node: NodeDto) => void
  activeId: string | null
  /** Reports the listed files in display (sorted) order, for previous/next navigation. */
  onFilesOrdered: (files: NodeDto[]) => void
  onDelete: (node: NodeDto) => void
  canDeleteFolders: boolean
  /** Admins may rename/copy/move folders; everyone may do so for files. */
  canManageFolders: boolean
  onRename: (node: NodeDto) => void
  onCopy: (node: NodeDto) => void
  onMove: (node: NodeDto) => void
  onDropFiles: (files: File[]) => void
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'createdAt', label: 'Created' },
  { key: 'modifiedAt', label: 'Modified' },
  { key: 'sizeInBytes', label: 'Size' },
]

export function FileTable({
  nodes,
  loading,
  selected,
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
  onDelete,
  canDeleteFolders,
  canManageFolders,
  onRename,
  onCopy,
  onMove,
  onDropFiles,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const copy = [...nodes]
    copy.sort((a, b) => {
      // Folders always sort before files, regardless of column.
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      } else if (sortKey === 'createdAt') {
        cmp = (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
      } else if (sortKey === 'modifiedAt') {
        cmp = (a.modifiedAt ?? '').localeCompare(b.modifiedAt ?? '')
      } else {
        cmp = (a.sizeInBytes ?? -1) - (b.sizeInBytes ?? -1)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [nodes, sortKey, sortDir])

  function rowActions(node: NodeDto): MenuAction[] {
    const actions: MenuAction[] = []
    if (node.isFile || canManageFolders) {
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
    if (node.isFile || canDeleteFolders) {
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
          <UploadCloud size={36} />
          <p>Drop files to upload</p>
        </div>
      )}

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
            {COLUMNS.map((col) => (
              <th key={col.key} className={`col-${col.key}`}>
                <button
                  type="button"
                  className="sort-button"
                  onClick={() => toggleSort(col.key)}
                  aria-label={`Sort by ${col.label}`}
                >
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
              </th>
            ))}
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`skeleton-${i}`} className="skeleton-row">
                <td>
                  <div className="skeleton skeleton-checkbox" />
                </td>
                <td>
                  <div className="skeleton skeleton-name" />
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
            sorted.map((node) => (
              <tr
                key={node.id}
                className={`${selected.has(node.id) ? 'selected' : ''}${node.id === activeId ? ' previewing' : ''}`}
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
                <td className="name-cell">
                  <FileIcon kind={kindFor(node.name, node.isFolder)} />
                  <div className="name-stack">
                  {node.isFolder ? (
                    <button type="button" className="link folder-link" onClick={() => onOpenFolder(node)}>
                      {node.name}
                      <ChevronRight size={15} className="folder-link-chevron" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="link"
                      onClick={() => onPreview(node)}
                      aria-current={node.id === activeId ? 'true' : undefined}
                    >
                      {node.name}
                    </button>
                  )}
                  {getLocation && (
                    <button
                      type="button"
                      className="search-location"
                      onClick={() => onOpenLocation(node)}
                      title="Open containing folder"
                    >
                      {getLocation(node)}
                    </button>
                  )}
                  </div>
                </td>
                <td className="col-createdAt">
                  <span>{formatDate(node.createdAt)}</span>
                  {node.createdByUser && <span className="created-by">by {node.createdByUser}</span>}
                </td>
                <td className="col-modifiedAt">{formatDate(node.modifiedAt)}</td>
                <td className="col-sizeInBytes">{node.isFile ? formatBytes(node.sizeInBytes) : '—'}</td>
                <td className="col-actions">
                  <div className="row-actions">
                    {node.isFile && (
                      <a
                        className="icon-button"
                        href={api.downloadUrl(node.id)}
                        download
                        aria-label={`Download ${node.name}`}
                        title={`Download ${node.name}`}
                      >
                        <Download size={16} aria-hidden="true" />
                      </a>
                    )}
                    {rowActions(node).length > 0 && (
                      <ActionsMenu iconOnly label={`Actions for ${node.name}`} disabled={false} actions={rowActions(node)} />
                    )}
                  </div>
                </td>
              </tr>
            ))}

          {!loading && sorted.length === 0 && (
            <tr className="empty-row">
              <td colSpan={6}>
                {isSearchView ? (
                  <EmptyState
                    icon={SearchX}
                    title="No results found"
                    description={`Nothing matched "${searchQuery}". Try a different search term.`}
                  />
                ) : (
                  <EmptyState
                    icon={FolderOpen}
                    title="No documents here yet"
                    description="Upload a file or drag and drop it anywhere in this list to get started."
                  />
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

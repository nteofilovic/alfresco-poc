import { useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FolderOpen, SearchX, Trash2, UploadCloud } from 'lucide-react'
import { api, type NodeDto } from '../api'
import { formatBytes, formatDate, kindFor } from '../formatters'
import { FileIcon } from './FileIcon'
import { EmptyState } from './EmptyState'

type SortKey = 'name' | 'modifiedAt' | 'sizeInBytes'
type SortDir = 'asc' | 'desc'

interface Props {
  nodes: NodeDto[]
  loading: boolean
  selected: Set<string>
  isSearchView: boolean
  searchQuery: string
  onToggleSelected: (id: string) => void
  onOpenFolder: (node: NodeDto) => void
  onPreview: (node: NodeDto) => void
  onDelete: (node: NodeDto) => void
  onDropFiles: (files: File[]) => void
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
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
  onOpenFolder,
  onPreview,
  onDelete,
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
      } else if (sortKey === 'modifiedAt') {
        cmp = (a.modifiedAt ?? '').localeCompare(b.modifiedAt ?? '')
      } else {
        cmp = (a.sizeInBytes ?? -1) - (b.sizeInBytes ?? -1)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [nodes, sortKey, sortDir])

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
            <th className="col-check"></th>
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
              <tr key={node.id} className={selected.has(node.id) ? 'selected' : ''}>
                <td className="col-check">
                  {node.isFile && (
                    <input
                      type="checkbox"
                      checked={selected.has(node.id)}
                      onChange={() => onToggleSelected(node.id)}
                      aria-label={`Select ${node.name} for merge`}
                    />
                  )}
                </td>
                <td className="name-cell">
                  <FileIcon kind={kindFor(node.name, node.isFolder)} />
                  {node.isFolder ? (
                    <button type="button" className="link" onClick={() => onOpenFolder(node)}>
                      {node.name}
                    </button>
                  ) : (
                    <button type="button" className="link" onClick={() => onPreview(node)}>
                      {node.name}
                    </button>
                  )}
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
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => onDelete(node)}
                      aria-label={`Delete ${node.name}`}
                      title={`Delete ${node.name}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

          {!loading && sorted.length === 0 && (
            <tr className="empty-row">
              <td colSpan={5}>
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

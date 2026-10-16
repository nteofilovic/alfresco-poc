import { Columns2, Copy, Download, FileStack, FolderInput, Trash2 } from 'lucide-react'
import type { NodeDto, Space } from '../api'
import { extensionBadge, formatBytes } from '../formatters'
import { roleLabel } from '../spaceRoles'
import type { SelectionActions } from '../selectionActions'
import { SpaceMark } from './SpaceMark'

interface Props {
  selected: NodeDto[]
  actions: SelectionActions
  onClear: () => void
}

function names(nodes: NodeDto[]): string {
  if (nodes.length === 1) return nodes[0].name
  if (nodes.length === 2) return `${nodes[0].name} and ${nodes[1].name}`
  return `${nodes[0].name}, ${nodes[1].name} and ${nodes.length - 2} more`
}

const ROTATIONS = [-5, 4, -1]

/**
 * Three-pane layout: the right-hand panel while rows are selected. A stack of the selected pages, what is
 * selected, Merge as the main action and the other selection actions as a list.
 */
export function SelectionPanel({ selected, actions, onClear }: Props) {
  const count = selected.length
  const allFiles = selected.every((n) => n.isFile)
  const totalBytes = selected.reduce((sum, n) => sum + (n.isFile ? (n.sizeInBytes ?? 0) : 0), 0)
  const noun = allFiles ? 'document' : 'item'
  const pages = selected.slice(0, 3)
  const list: { key: keyof SelectionActions; label: string; icon: typeof Copy; danger?: boolean }[] = [
    { key: 'download', label: 'Download', icon: Download },
    { key: 'compare', label: 'Compare side by side', icon: Columns2 },
    { key: 'copy', label: 'Copy to…', icon: Copy },
    { key: 'move', label: 'Move to…', icon: FolderInput },
    { key: 'delete', label: 'Delete', icon: Trash2, danger: true },
  ]

  return (
    <aside className="side-panel selection-panel" aria-label="Selection">
      <div className="page-stack" aria-hidden="true">
        {pages.map((n, i) => (
          <span
            key={n.id}
            className="page-stack-page"
            style={{ left: `${18 + i * (pages.length === 3 ? 62 : 92)}px`, transform: `rotate(${ROTATIONS[i]}deg)`, zIndex: i }}
          >
            <span className={`page-stack-type${n.isFolder ? ' folder' : ''}`}>{n.isFolder ? 'Folder' : extensionBadge(n.name) || 'File'}</span>
            <b />
            <b style={{ width: '70%' }} />
            <b />
            <b style={{ width: '50%' }} />
          </span>
        ))}
      </div>

      <h2 className="selection-panel-title" aria-live="polite">
        {count} {noun}
        {count === 1 ? '' : 's'} selected
      </h2>
      <p className="selection-panel-meta">
        {names(selected)}
        {totalBytes > 0 && count > 1 ? `, ${formatBytes(totalBytes)} in total` : ''}
      </p>

      <button
        type="button"
        className="btn btn-primary btn-lg selection-panel-merge"
        disabled={!actions.merge.available}
        onClick={actions.merge.run}
      >
        <FileStack size={17} strokeWidth={1.8} aria-hidden="true" />
        Merge into one PDF
      </button>
      <p className="selection-panel-hint">
        {actions.merge.available ? 'Files are combined in the order shown in the list.' : actions.merge.hint}
      </p>

      <ul className="selection-panel-list">
        {list
          .filter(({ key }) => key !== 'compare' || actions.compare.available)
          .map(({ key, label, icon: Icon, danger }) => {
            const action = actions[key]
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`selection-panel-action${danger ? ' danger' : ''}`}
                  disabled={!action.available}
                  title={action.available ? undefined : action.hint}
                  onClick={action.run}
                >
                  <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  {label}
                </button>
              </li>
            )
          })}
      </ul>

      <button type="button" className="selection-panel-clear" onClick={onClear}>
        Clear selection
      </button>
    </aside>
  )
}

/** Three-pane layout: the right-hand panel inside a space while nothing is selected. */
export function SpaceInfoPanel({ space }: { space: Space }) {
  return (
    <aside className="side-panel space-info" aria-label={`About ${space.title}`}>
      <SpaceMark id={space.id} title={space.title} size="lg" />
      <h2 className="selection-panel-title">{space.title}</h2>
      {space.description && <p className="selection-panel-meta">{space.description}</p>}
      <dl className="space-info-meta">
        <div>
          <dt>Your role</dt>
          <dd>{roleLabel(space.role)}</dd>
        </div>
        <div>
          <dt>Visibility</dt>
          <dd>{space.visibility.charAt(0) + space.visibility.slice(1).toLowerCase()}</dd>
        </div>
      </dl>
      <p className="selection-panel-hint">Select documents in the list to merge, compare, copy or move them.</p>
    </aside>
  )
}

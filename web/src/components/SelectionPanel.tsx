import { Columns2, Copy, Download, FileStack, FolderInput, Trash2 } from 'lucide-react'
import type { NodeDto, Space } from '../api'
import { extensionBadge, formatBytes } from '../formatters'
import { roleLabel } from '../spaceRoles'
import type { SelectionActions } from '../selectionActions'
import type { MenuAction } from './ActionsMenu'
import { SpaceMark } from './SpaceMark'

interface Props {
  selected: NodeDto[]
  /** How many of them are not on the page being shown. */
  elsewhere: number
  actions: SelectionActions
  /** Set when exactly one row is selected: the same actions as that row's 3-dots menu, shown instead of the bulk list. */
  rowMenu?: MenuAction[]
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
 * selected and the selection actions as a list (Merge to PDF only while several are selected).
 */
export function SelectionPanel({ selected, elsewhere, actions, rowMenu, onClear }: Props) {
  const count = selected.length
  const allFiles = selected.every((n) => n.isFile)
  const totalBytes = selected.reduce((sum, n) => sum + (n.isFile ? (n.sizeInBytes ?? 0) : 0), 0)
  const noun = allFiles ? 'document' : 'item'
  const pages = selected.slice(0, 3)
  const list: { key: keyof SelectionActions; label: string; icon: typeof Copy; danger?: boolean }[] = [
    { key: 'download', label: 'Download', icon: Download },
    { key: 'merge', label: 'Merge to PDF', icon: FileStack },
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
      {elsewhere > 0 && (
        <p className="selection-panel-meta selection-elsewhere">
          {elsewhere} on {elsewhere === 1 ? 'another page' : 'other pages'}. The selection is kept while you change page.
        </p>
      )}
      <p className="selection-panel-meta">
        {names(selected)}
        {totalBytes > 0 && count > 1 ? `, ${formatBytes(totalBytes)} in total` : ''}
      </p>

      {rowMenu ? (
        <ul className="selection-panel-list">
          {rowMenu.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className={`selection-panel-action${item.danger ? ' danger' : ''}`}
                disabled={item.disabled}
                title={item.disabled ? item.hint : undefined}
                onClick={item.onSelect}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="selection-panel-list">
          {list
            .filter(({ key }) => (key !== 'compare' || actions.compare.available) && (key !== 'merge' || count > 1))
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
      )}

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

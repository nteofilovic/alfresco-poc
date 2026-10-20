import { ArrowRight, Columns2, Copy, Download, FileStack, FolderPlus, Plus, Shapes, Trash2, Upload, X } from 'lucide-react'
import type { SelectionActions } from '../selectionActions'
import { ActionsMenu } from './ActionsMenu'

interface Props {
  /** A folder is open (not search results, not another page): New and Upload work on it. */
  inFolder: boolean
  /** False for read-only members (site role Viewer). */
  canUpload: boolean
  canCreateFolder: boolean
  templates: { id: string; name: string }[]
  onUpload: () => void
  onNewFolder: () => void
  onNewFromTemplate: (templateId: string) => void
  selectedCount: number
  /** How many selected items are not on the page being shown. */
  selectedElsewhere: number
  actions: SelectionActions
  onClearSelection: () => void
}

/**
 * Command-bar layout: the action toolbar under the header. New and Upload act on the open folder, the rest on the
 * selected rows; each button is enabled only when its action can run, and the chip shows what is selected.
 */
export function CommandBar({
  inFolder,
  canUpload,
  canCreateFolder,
  templates,
  onUpload,
  onNewFolder,
  onNewFromTemplate,
  selectedCount,
  selectedElsewhere,
  actions,
  onClearSelection,
}: Props) {
  const canAdd = inFolder && canUpload
  const button = (key: keyof SelectionActions, label: string, Icon: typeof Copy, danger = false) => {
    const action = actions[key]
    return (
      <button
        type="button"
        className={`cmd-button${danger ? ' danger' : ''}`}
        disabled={!action.available}
        title={action.available ? undefined : action.hint}
        onClick={action.run}
      >
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
        {label}
      </button>
    )
  }

  return (
    <div className="cmd-bar" role="toolbar" aria-label="Actions">
      <ActionsMenu
        label="New"
        disabled={!canAdd}
        disabledHint={inFolder ? 'Viewers can’t add to this space' : 'Open a folder first'}
        triggerClassName="cmd-button cmd-button-primary"
        actions={[
          {
            key: 'folder',
            label: 'New folder',
            icon: <FolderPlus size={15} aria-hidden="true" />,
            disabled: !canCreateFolder,
            hint: 'Only space managers and collaborators can create folders. Use a template instead.',
            onSelect: onNewFolder,
          },
          ...templates.map((t) => ({
            key: `template-${t.id}`,
            label: `New ${t.name}`,
            icon: <Shapes size={15} aria-hidden="true" />,
            onSelect: () => onNewFromTemplate(t.id),
          })),
        ]}
      >
        <Plus size={17} strokeWidth={2.2} aria-hidden="true" />
        New
      </ActionsMenu>
      <button type="button" className="cmd-button" disabled={!canAdd} title={canAdd ? undefined : 'Open a folder first'} onClick={onUpload}>
        <Upload size={17} strokeWidth={1.8} aria-hidden="true" />
        Upload
      </button>
      <span className="cmd-sep" aria-hidden="true" />
      {button('download', 'Download', Download)}
      {button('compare', 'Compare', Columns2)}
      {button('merge', 'Merge to PDF', FileStack)}
      <span className="cmd-sep" aria-hidden="true" />
      {button('copy', 'Copy to', Copy)}
      {button('move', 'Move to', ArrowRight)}
      {button('delete', 'Delete', Trash2, true)}

      {selectedCount > 0 && (
        <span className="cmd-count" aria-live="polite">
          {selectedCount} selected{selectedElsewhere > 0 ? ` (${selectedElsewhere} on other pages)` : ''}
          <button type="button" className="cmd-count-clear" onClick={onClearSelection} aria-label="Clear selection" title="Clear selection">
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  )
}

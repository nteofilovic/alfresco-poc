import { FolderPlus, RefreshCw, Shapes, Upload } from 'lucide-react'
import { ActionsMenu } from './ActionsMenu'
import { Spinner } from './Spinner'

interface Props {
  refreshing: boolean
  canCreateFolder: boolean
  /** False for read-only members (site role Viewer): New and Upload are hidden. */
  canUpload: boolean
  /** Folder templates members can create from (Client, Property...). */
  templates: { id: string; name: string }[]
  onUpload: () => void
  onNewFolder: () => void
  onNewFromTemplate: (templateId: string) => void
  onRefresh: () => void
}

/** Folder header actions (three-pane layout): refresh, the "New" menu (folder for managers, one entry per folder template) and Upload. */
export function Toolbar({ refreshing, canCreateFolder, canUpload, templates, onUpload, onNewFolder, onNewFromTemplate, onRefresh }: Props) {
  return (
    <div className="toolbar">
      <button
        type="button"
        className="btn btn-secondary btn-icon btn-lg"
        onClick={onRefresh}
        aria-label="Refresh"
        title="Refresh"
        disabled={refreshing}
      >
        {refreshing ? <Spinner size={15} /> : <RefreshCw size={16} aria-hidden="true" />}
      </button>
      {canUpload && (
        <>
          <ActionsMenu
            label="New"
            disabled={false}
            triggerClassName="btn btn-secondary btn-lg"
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
            <FolderPlus size={16} strokeWidth={1.8} aria-hidden="true" />
            New
          </ActionsMenu>
          <button type="button" className="btn btn-primary btn-lg" onClick={onUpload}>
            <Upload size={16} strokeWidth={1.9} aria-hidden="true" />
            Upload
          </button>
        </>
      )}
    </div>
  )
}

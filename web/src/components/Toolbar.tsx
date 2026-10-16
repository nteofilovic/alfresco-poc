import { FolderPlus, Plus, RefreshCw, Shapes, Upload } from 'lucide-react'
import { ActionsMenu } from './ActionsMenu'
import { Spinner } from './Spinner'

interface Props {
  refreshing: boolean
  canCreateFolder: boolean
  /** False for read-only members (site role Viewer): the New menu is hidden. */
  canUpload: boolean
  /** Folder templates members can create from (Client, Property...). */
  templates: { id: string; name: string }[]
  onUpload: () => void
  onNewFolder: () => void
  onNewFromTemplate: (templateId: string) => void
  onRefresh: () => void
}

/** Folder header actions: refresh and the "New" menu (upload, folder for admins, one entry per folder template). */
export function Toolbar({
  refreshing,
  canCreateFolder,
  canUpload,
  templates,
  onUpload,
  onNewFolder,
  onNewFromTemplate,
  onRefresh,
}: Props) {
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
        <ActionsMenu
          label="New"
          disabled={false}
          triggerClassName="btn btn-primary btn-lg"
          actions={[
            {
              key: 'upload',
              label: 'Upload files',
              icon: <Upload size={15} aria-hidden="true" />,
              onSelect: onUpload,
            },
            {
              key: 'folder',
              label: 'New folder',
              icon: <FolderPlus size={15} aria-hidden="true" />,
              disabled: !canCreateFolder,
              hint: 'Only space managers and collaborators can create folders. Use a template instead.',
              onSelect: onNewFolder,
            },
            ...(templates.length > 0
              ? [
                  {
                    key: 'template',
                    label: 'Template…',
                    icon: <Shapes size={15} aria-hidden="true" />,
                    onSelect: () => {},
                    submenu: templates.map((t) => ({
                      key: `template-${t.id}`,
                      label: t.name,
                      icon: <Shapes size={15} aria-hidden="true" />,
                      onSelect: () => onNewFromTemplate(t.id),
                    })),
                  },
                ]
              : []),
          ]}
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          New
        </ActionsMenu>
      )}
    </div>
  )
}

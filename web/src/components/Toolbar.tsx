import { FolderPlus, RefreshCw, Upload } from 'lucide-react'
import type { ChangeEvent, RefObject } from 'react'
import { Spinner } from './Spinner'
import { ActionsMenu, type MenuAction } from './ActionsMenu'

interface Props {
  fileInputRef: RefObject<HTMLInputElement | null>
  disabled: boolean
  refreshing: boolean
  canCreateFolder: boolean
  selectedCount: number
  bulkActions: MenuAction[]
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void
  onNewFolder: () => void
  onRefresh: () => void
}

export function Toolbar({
  fileInputRef,
  disabled,
  refreshing,
  canCreateFolder,
  selectedCount,
  bulkActions,
  onUpload,
  onNewFolder,
  onRefresh,
}: Props) {
  return (
    <div className="toolbar">
      <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
        <Upload size={15} aria-hidden="true" />
        Upload
      </button>
      <input type="file" multiple ref={fileInputRef} hidden onChange={onUpload} aria-hidden="true" tabIndex={-1} />
      <ActionsMenu
        label={selectedCount > 1 ? `Actions · ${selectedCount}` : 'Actions'}
        disabled={disabled || selectedCount < 2}
        disabledHint="Select two or more items to see bulk actions"
        actions={bulkActions}
      />
      {canCreateFolder && (
        <button type="button" className="btn btn-secondary" onClick={onNewFolder} disabled={disabled}>
          <FolderPlus size={15} aria-hidden="true" />
          New folder
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost toolbar-refresh"
        onClick={onRefresh}
        aria-label="Refresh"
        disabled={refreshing}
      >
        {refreshing ? <Spinner size={14} /> : <RefreshCw size={15} aria-hidden="true" />}
        Refresh
      </button>
    </div>
  )
}

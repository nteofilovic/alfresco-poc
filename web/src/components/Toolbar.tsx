import { FolderPlus, RefreshCw, Upload } from 'lucide-react'
import { Spinner } from './Spinner'

interface Props {
  refreshing: boolean
  canCreateFolder: boolean
  onUpload: () => void
  onNewFolder: () => void
  onRefresh: () => void
}

/** Folder header actions: refresh, new folder (admins) and upload. */
export function Toolbar({ refreshing, canCreateFolder, onUpload, onNewFolder, onRefresh }: Props) {
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
      {canCreateFolder && (
        <button type="button" className="btn btn-secondary btn-lg" onClick={onNewFolder}>
          <FolderPlus size={16} aria-hidden="true" />
          New folder
        </button>
      )}
      <button type="button" className="btn btn-secondary btn-lg" onClick={onUpload}>
        <Upload size={16} aria-hidden="true" />
        Upload
      </button>
    </div>
  )
}

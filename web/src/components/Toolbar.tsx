import { FolderPlus, RefreshCw, Upload } from 'lucide-react'
import type { ChangeEvent, RefObject } from 'react'
import { Spinner } from './Spinner'

interface Props {
  fileInputRef: RefObject<HTMLInputElement | null>
  disabled: boolean
  refreshing: boolean
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void
  onNewFolder: () => void
  onRefresh: () => void
}

export function Toolbar({ fileInputRef, disabled, refreshing, onUpload, onNewFolder, onRefresh }: Props) {
  return (
    <div className="toolbar">
      <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
        <Upload size={15} aria-hidden="true" />
        Upload
      </button>
      <input type="file" multiple ref={fileInputRef} hidden onChange={onUpload} aria-hidden="true" tabIndex={-1} />
      <button type="button" className="btn btn-secondary" onClick={onNewFolder} disabled={disabled}>
        <FolderPlus size={15} aria-hidden="true" />
        New folder
      </button>
      <button
        type="button"
        className="btn btn-secondary"
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

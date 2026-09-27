import { FileStack } from 'lucide-react'
import { Spinner } from './Spinner'

interface Props {
  selectedCount: number
  fileName: string
  merging: boolean
  disabled: boolean
  onFileNameChange: (value: string) => void
  onMerge: () => void
}

export function MergeBar({ selectedCount, fileName, merging, disabled, onFileNameChange, onMerge }: Props) {
  return (
    <div className="merge-bar" role="region" aria-label="Merge selected files">
      <span className="merge-bar-badge">
        <FileStack size={15} aria-hidden="true" />
        {selectedCount} selected
      </span>
      <input
        className="merge-bar-input"
        value={fileName}
        onChange={(e) => onFileNameChange(e.target.value)}
        placeholder="merged-document"
        aria-label="Merged file name"
      />
      <button
        type="button"
        className="btn btn-primary"
        onClick={onMerge}
        disabled={selectedCount < 2 || merging || disabled}
        title={selectedCount < 2 ? 'Select at least 2 files' : ''}
      >
        {merging ? <Spinner size={14} label="Merging…" /> : 'Merge into one PDF'}
      </button>
    </div>
  )
}

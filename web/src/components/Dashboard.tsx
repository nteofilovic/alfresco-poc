import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { FolderPlus, Inbox, Upload } from 'lucide-react'
import { api, type NodeDto } from '../api'
import { formatBytes, formatDate, kindFor } from '../formatters'
import { FileIcon } from './FileIcon'
import { EmptyState } from './EmptyState'
import { Spinner } from './Spinner'

// Alfresco's "Home folder" node id - same alias App.tsx uses for the root of the Browse view.
const HOME_FOLDER_ID = '-my-'

interface Props {
  firstName: string
  onNewFolder: () => void
  onPreview: (node: NodeDto) => void
  onBrowseAll: () => void
  onError: (message: string) => void
}

export function Dashboard({ firstName, onNewFolder, onPreview, onBrowseAll, onError }: Props) {
  const [recentDocs, setRecentDocs] = useState<NodeDto[]>([])
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function triggerUpload() {
    fileInputRef.current?.click()
  }

  const loadRecent = useCallback(async () => {
    setLoading(true)
    try {
      setRecentDocs(await api.recentDocuments(20))
    } catch (err) {
      onError(String(err))
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    loadRecent()
  }, [loadRecent])

  async function handleUploadInput(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      for (const file of Array.from(files)) {
        await api.uploadFile(HOME_FOLDER_ID, file)
      }
      await loadRecent()
    } catch (err) {
      onError(String(err))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-welcome">
        <h2>Hello, {firstName}</h2>
        <p>Pick up where you left off, or add something new.</p>
      </div>

      <div className="dashboard-quick-actions">
        <button type="button" className="btn btn-primary" onClick={triggerUpload}>
          <Upload size={15} aria-hidden="true" />
          Upload document
        </button>
        <input type="file" multiple ref={fileInputRef} hidden onChange={handleUploadInput} aria-hidden="true" tabIndex={-1} />
        <button type="button" className="btn btn-secondary" onClick={onNewFolder}>
          <FolderPlus size={15} aria-hidden="true" />
          New folder
        </button>
        <button type="button" className="btn btn-secondary" onClick={onBrowseAll}>
          Browse all documents
        </button>
      </div>

      <section className="dashboard-recent">
        <h3>Recent documents</h3>

        {loading && (
          <div className="dashboard-recent-loading">
            <Spinner size={18} label="Loading recent documents…" />
          </div>
        )}

        {!loading && recentDocs.length === 0 && (
          <EmptyState
            icon={Inbox}
            title="No documents yet"
            description="Upload a document to see it appear here."
          />
        )}

        {!loading && recentDocs.length > 0 && (
          <ul className="dashboard-recent-list">
            {recentDocs.map((node) => (
              <li key={node.id} className="dashboard-recent-item">
                <span className="name-cell">
                  <FileIcon kind={kindFor(node.name, node.isFolder)} />
                  <button type="button" className="link" onClick={() => onPreview(node)}>
                    {node.name}
                  </button>
                </span>
                <span className="dashboard-recent-meta">
                  <span>{formatDate(node.modifiedAt)}</span>
                  <span>{formatBytes(node.sizeInBytes)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

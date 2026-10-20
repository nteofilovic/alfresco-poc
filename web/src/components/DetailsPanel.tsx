import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api, type NodeDto } from '../api'
import { formatBytes, formatDate, initials, typeLabel } from '../formatters'
import { FileTile } from './FileIcon'
import { Spinner } from './Spinner'

interface Props {
  node: NodeDto
  ownerName: string
  location: string
  onOpen: () => void
  /** Copies the link to the document (the app shows the confirmation). */
  onShare: () => void
  onClose: () => void
}

type Thumb = { status: 'loading' } | { status: 'none' } | { status: 'ready'; url: string; contentType: string }

/** Right-side details for the selected file: thumbnail, Open/Download/Share and key metadata. Keyed by node id.
 *  Only image renditions are shown as a real thumbnail; the full preview (Open) shows documents. */
export function DetailsPanel({ node, ownerName, location, onOpen, onShare, onClose }: Props) {
  const [thumb, setThumb] = useState<Thumb>({ status: 'loading' })

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    api
      .fetchPreview(node.id)
      .then((result) => {
        if (cancelled) return
        if (!result) return setThumb({ status: 'none' })
        objectUrl = URL.createObjectURL(result.blob)
        setThumb({ status: 'ready', url: objectUrl, contentType: result.contentType })
      })
      .catch(() => !cancelled && setThumb({ status: 'none' }))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [node.id])

  const description = node.properties?.['cm:description']
  const title = node.properties?.['cm:title']

  return (
    <aside className="details" aria-label={`Details of ${node.name}`}>
      <div className="details-head">
        <div className="details-title">
          <p className="details-name">{node.name}</p>
          <p className="details-sub">
            {typeLabel(node.name, node.isFolder)}, {formatBytes(node.sizeInBytes)}
          </p>
        </div>
        <button type="button" className="icon-button icon-button-soft" onClick={onClose} aria-label="Close details" title="Close">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="details-thumb">
        {thumb.status === 'loading' ? (
          <Spinner size={20} label="Loading preview…" />
        ) : thumb.status === 'ready' && thumb.contentType.startsWith('image/') ? (
          <img src={thumb.url} alt="" />
        ) : (
          // Documents get a drawn page rather than an embedded viewer, which is heavy and unreadable at this size.
          <span className="details-paper" aria-hidden="true">
            <FileTile name={node.name} isFolder={false} size="sm" />
            <span className="details-paper-line details-paper-line-title" />
            <span className="details-paper-line" />
            <span className="details-paper-line" />
            <span className="details-paper-line details-paper-line-short" />
            <span className="details-paper-block" />
            <span className="details-paper-line" />
          </span>
        )}
        <button type="button" className="details-thumb-open" onClick={onOpen} aria-label={`Open preview of ${node.name}`} />
      </div>

      <div className="details-actions">
        <button type="button" className="btn btn-primary" onClick={onOpen}>
          Open
        </button>
        <a className="btn btn-secondary" href={api.downloadUrl(node.id)} download>
          Download
        </a>
        <button type="button" className="btn btn-secondary" onClick={onShare} title="Copy a link to this document">
          Share
        </button>
      </div>

      <dl className="details-meta">
        <div>
          <dt>Modified</dt>
          <dd>{formatDate(node.modifiedAt)}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd className="details-owner">
            {node.createdByUser ? (
              <>
                <span className="avatar avatar-muted avatar-xs" aria-hidden="true">
                  {initials(ownerName)}
                </span>
                {ownerName}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(node.sizeInBytes)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(node.createdAt)}</dd>
        </div>
        <div className="details-meta-wide">
          <dt>Location</dt>
          <dd>{location}</dd>
        </div>
        {typeof title === 'string' && title && (
          <div className="details-meta-wide">
            <dt>Title</dt>
            <dd>{title}</dd>
          </div>
        )}
        {typeof description === 'string' && description && (
          <div className="details-meta-wide">
            <dt>Description</dt>
            <dd>{description}</dd>
          </div>
        )}
      </dl>
    </aside>
  )
}

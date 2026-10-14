import { FolderOpen } from 'lucide-react'
import type { Space } from '../api'
import { spaceColor } from '../spaceColor'
import { EmptyState } from './EmptyState'
import { SpaceMark } from './SpaceMark'
import { Spinner } from './Spinner'

interface Props {
  /** null while loading. */
  spaces: Space[] | null
  isAdmin: boolean
  onOpen: (space: Space) => void
}

const ROLE_LABEL: Record<string, string> = {
  SiteManager: 'Manager',
  SiteCollaborator: 'Collaborator',
  SiteContributor: 'Contributor',
  SiteConsumer: 'Viewer',
}

/** The spaces (business areas) the signed-in user can open. */
export function SpacesPage({ spaces, isAdmin, onOpen }: Props) {
  return (
    <section className="folder" aria-labelledby="spaces-heading">
      <div className="page-head">
        <h1 id="spaces-heading">Spaces</h1>
        <p>Each space holds the documents of one area of your company.</p>
      </div>

      {spaces === null ? (
        <div className="admin-placeholder">
          <Spinner size={22} label="Loading spaces…" />
        </div>
      ) : spaces.length === 0 ? (
        <div className="sheet">
          <EmptyState
            icon={FolderOpen}
            title="No spaces yet"
            description={
              isAdmin
                ? 'Open Administration and create the first space, then add people to it.'
                : 'Ask an administrator to add you to a space.'
            }
          />
        </div>
      ) : (
        <ul className="spaces-grid">
          {spaces.map((s) => (
            <li key={s.id}>
              <button type="button" className="space-card" style={spaceColor(s.id)} onClick={() => onOpen(s)}>
                <SpaceMark id={s.id} title={s.title} size="lg" />
                <span className="space-card-title">{s.title}</span>
                {s.description && <span className="space-card-desc">{s.description}</span>}
                <span className="space-card-meta">
                  {s.role ? (ROLE_LABEL[s.role] ?? s.role) : 'Administrator'}
                  {s.visibility && s.visibility !== 'PRIVATE' ? ` · ${s.visibility.toLowerCase()}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

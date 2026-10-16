import { LayoutGrid, Plus } from 'lucide-react'
import type { Space } from '../api'
import { spaceColor } from '../spaceColor'

interface Props {
  spaces: Space[] | null
  currentSpaceId: string | null
  isAdmin: boolean
  onOpenSpace: (space: Space) => void
  onOpenAll: () => void
  /** Admins: spaces are created in Administration. */
  onNewSpace: () => void
}

/** Three-pane layout: the column next to the rail listing the user's spaces, each in its own colour. */
export function SpacesColumn({ spaces, currentSpaceId, isAdmin, onOpenSpace, onOpenAll, onNewSpace }: Props) {
  const count = spaces?.length ?? 0
  return (
    <nav className="spaces-col" aria-label="Your spaces">
      <button type="button" className={`spaces-col-head${currentSpaceId ? '' : ' active'}`} onClick={onOpenAll}>
        <span className="spaces-col-title">Spaces</span>
        <span className="spaces-col-sub">{spaces ? `${count} space${count === 1 ? '' : 's'}` : 'Loading…'}</span>
        <LayoutGrid size={15} strokeWidth={1.8} className="spaces-col-all" aria-hidden="true" />
      </button>
      <ul className="spaces-col-list">
        {(spaces ?? []).map((s) => {
          const active = s.id === currentSpaceId
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`spaces-col-item${active ? ' active' : ''}`}
                style={spaceColor(s.id)}
                aria-current={active ? 'page' : undefined}
                title={s.description || s.title}
                onClick={() => onOpenSpace(s)}
              >
                <span className="spaces-col-dot" aria-hidden="true" />
                <span className="spaces-col-name">{s.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {isAdmin && (
        <button type="button" className="spaces-col-add" onClick={onNewSpace}>
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          New space
        </button>
      )}
    </nav>
  )
}

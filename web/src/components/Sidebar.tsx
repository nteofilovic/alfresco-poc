import { ChevronsUpDown, FolderClosed, House, LogOut, Settings, SquareCheckBig, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Space } from '../api'
import { spaceColor } from '../spaceColor'
import { initials } from '../formatters'
import { ActionsMenu } from './ActionsMenu'

export type View = 'home' | 'spaces' | 'tasks' | 'admin' | 'profile'

interface Props {
  /** Display name for the user card. */
  displayName: string
  isAdmin: boolean
  /** Shown under the product name (the company name); empty hides it. */
  companyName: string
  view: View
  /** The spaces the user belongs to, listed under Spaces for one-click access. */
  spaces: Space[]
  /** The space that is open, if any; its entry is highlighted in its own color. */
  currentSpaceId: string | null
  onOpenSpace: (space: Space) => void
  /** Unseen task notices, shown as a badge on the Tasks link. */
  taskBadge?: number
  onNavigate: (view: View) => void
  onLogout: () => void
}

function NavLink({
  view,
  current,
  icon,
  label,
  badge = 0,
  onNavigate,
}: {
  view: View
  current: View | null
  icon: ReactNode
  label: string
  badge?: number
  onNavigate: (view: View) => void
}) {
  const active = view === current
  return (
    <button
      type="button"
      className={`rail-link${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(view)}
      title={badge > 0 ? `${label} (${badge} new)` : label}
    >
      {icon}
      <span className="rail-label">{label}</span>
      {badge > 0 && (
        <span className="rail-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {badge > 0 && <span className="sr-only"> ({badge} new)</span>}
    </button>
  )
}

export function Sidebar({ displayName, isAdmin, companyName, view, spaces, currentSpaceId, onOpenSpace, taskBadge = 0, onNavigate, onLogout }: Props) {
  const icon = (C: typeof House) => <C size={18} strokeWidth={1.8} aria-hidden="true" />
  return (
    <aside className="rail">
      <div className="rail-brand">
        <span className="rail-logo" aria-hidden="true">
          Z
        </span>
        <span className="rail-brand-text">
          <span className="rail-product">Zapis</span>
          {companyName && <span className="rail-company">{companyName}</span>}
        </span>
      </div>

      <nav className="rail-nav" aria-label="Main">
        <NavLink view="home" current={view} icon={icon(House)} label="Home" onNavigate={onNavigate} />
        {/* With a space open, its own entry below carries the highlight instead. */}
        <NavLink
          view="spaces"
          current={view === 'spaces' && currentSpaceId ? null : view}
          icon={icon(FolderClosed)}
          label="Spaces"
          onNavigate={onNavigate}
        />
        {spaces.length > 0 && (
          <ul className="rail-spaces" aria-label="Your spaces">
            {spaces.map((s) => {
              const active = view === 'spaces' && s.id === currentSpaceId
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`rail-space${active ? ' active' : ''}`}
                    style={spaceColor(s.id)}
                    aria-current={active ? 'page' : undefined}
                    title={s.title}
                    onClick={() => onOpenSpace(s)}
                  >
                    <span className="rail-space-dot" aria-hidden="true" />
                    <span className="rail-label">{s.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <NavLink view="tasks" current={view} icon={icon(SquareCheckBig)} label="Tasks" badge={taskBadge} onNavigate={onNavigate} />
        {isAdmin && <NavLink view="admin" current={view} icon={icon(Settings)} label="Administration" onNavigate={onNavigate} />}
      </nav>

      <div className={`rail-user${view === 'profile' ? ' active' : ''}`}>
        <span className="avatar avatar-dark" aria-hidden="true">
          {initials(displayName)}
        </span>
        <span className="rail-user-text">
          <span className="rail-user-name" title={displayName}>
            {displayName}
          </span>
          <span className="rail-user-role">{isAdmin ? 'Administrator' : 'Member'}</span>
        </span>
        <ActionsMenu
          iconOnly
          label="Account menu"
          disabled={false}
          icon={<ChevronsUpDown size={16} aria-hidden="true" />}
          actions={[
            { key: 'profile', label: 'Profile', icon: <UserRound size={15} aria-hidden="true" />, onSelect: () => onNavigate('profile') },
            { key: 'logout', label: 'Sign out', icon: <LogOut size={15} aria-hidden="true" />, onSelect: onLogout },
          ]}
        />
      </div>
    </aside>
  )
}

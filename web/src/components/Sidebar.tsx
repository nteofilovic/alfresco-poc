import { ChevronsUpDown, FolderClosed, House, LogOut, Settings, SquareCheckBig, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
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
  current: View
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

export function Sidebar({ displayName, isAdmin, companyName, view, taskBadge = 0, onNavigate, onLogout }: Props) {
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
        <NavLink view="spaces" current={view} icon={icon(FolderClosed)} label="Spaces" onNavigate={onNavigate} />
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

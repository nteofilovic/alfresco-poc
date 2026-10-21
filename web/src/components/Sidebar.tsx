import { FolderClosed, House, LogOut, Settings, SquareCheckBig, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { initials } from '../formatters'
import { ActionsMenu } from './ActionsMenu'
import { LayersMark } from './LayersMark'

export type View = 'home' | 'spaces' | 'tasks' | 'admin' | 'profile'

interface Props {
  /** Display name for the account button. */
  displayName: string
  isAdmin: boolean
  view: View
  /** Unseen task notices, shown as a badge on the Tasks link. */
  taskBadge?: number
  onNavigate: (view: View) => void
  onLogout: () => void
}

function RailLink({
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
      aria-label={badge > 0 ? `${label} (${badge} new)` : label}
      title={label}
      onClick={() => onNavigate(view)}
    >
      {icon}
      {badge > 0 && (
        <span className="rail-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

/** Three-pane layout: the dark 60px icon rail with the main sections and the account button at the bottom. */
export function Sidebar({ displayName, isAdmin, view, taskBadge = 0, onNavigate, onLogout }: Props) {
  const icon = (C: typeof House) => <C size={19} strokeWidth={1.8} aria-hidden="true" />
  return (
    <aside className="rail">
      <span className="rail-logo" aria-hidden="true">
        <LayersMark size={24} />
      </span>
      <span className="sr-only">Zapis</span>

      <nav className="rail-nav" aria-label="Main">
        <RailLink view="home" current={view} icon={icon(House)} label="Home" onNavigate={onNavigate} />
        <RailLink view="spaces" current={view} icon={icon(FolderClosed)} label="Spaces" onNavigate={onNavigate} />
        <RailLink view="tasks" current={view} icon={icon(SquareCheckBig)} label="Tasks" badge={taskBadge} onNavigate={onNavigate} />
        {isAdmin && <RailLink view="admin" current={view} icon={icon(Settings)} label="Administration" onNavigate={onNavigate} />}
      </nav>

      <ActionsMenu
        iconOnly
        label={`Account: ${displayName}`}
        disabled={false}
        triggerClassName={`rail-account${view === 'profile' ? ' active' : ''}`}
        icon={<span aria-hidden="true">{initials(displayName)}</span>}
        actions={[
          { key: 'profile', label: 'Profile', icon: <UserRound size={15} aria-hidden="true" />, onSelect: () => onNavigate('profile') },
          { key: 'logout', label: 'Sign out', icon: <LogOut size={15} aria-hidden="true" />, onSelect: onLogout },
        ]}
      />
    </aside>
  )
}

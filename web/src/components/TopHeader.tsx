import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { LogOut, Search, UserRound } from 'lucide-react'
import { initials } from '../formatters'
import { IS_MAC } from '../keyboard'
import { ActionsMenu } from './ActionsMenu'
import { LayersMark } from './LayersMark'
import type { View } from './Sidebar'
import { NotificationsButton } from './Topbar'

interface Props {
  displayName: string
  view: View
  onNavigate: (view: View) => void
  onLogout: () => void
  /** What the search field shows while closed: the active search, if any. */
  searchQuery: string
  onOpenPalette: () => void
  notificationCount: number
  notifications: (close: () => void) => ReactNode
}

/**
 * Command-bar layout: the coloured header with the brand, the search field (opens the command palette, also on
 * Ctrl/⌘+K), notifications and the account menu.
 */
export function TopHeader({ displayName, view, onNavigate, onLogout, searchQuery, onOpenPalette, notificationCount, notifications }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenPalette()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onOpenPalette])

  return (
    <header className="top-header">
      <button type="button" className="top-header-brand" onClick={() => onNavigate('home')} aria-label="Zapis, go to Home">
        <span className="top-header-logo" aria-hidden="true">
          <LayersMark size={20} />
        </span>
        <span aria-hidden="true">Zapis</span>
      </button>

      <button
        type="button"
        className="top-header-search"
        onClick={onOpenPalette}
        aria-haspopup="dialog"
        aria-label={searchQuery ? `Search and commands, current search: ${searchQuery}` : 'Search and commands'}
        title={`Search and commands (${IS_MAC ? '⌘' : 'Ctrl'} K)`}
      >
        <Search size={16} strokeWidth={1.9} aria-hidden="true" />
        <span className={`top-header-search-text${searchQuery ? ' has-query' : ''}`}>{searchQuery || 'Search all documents'}</span>
        <kbd className="top-header-kbd" aria-hidden="true">
          {IS_MAC ? '⌘ K' : 'Ctrl K'}
        </kbd>
      </button>

      <div className="top-header-actions">
        <NotificationsButton count={notificationCount}>{notifications}</NotificationsButton>
        <span className="top-header-name">{displayName}</span>
        <ActionsMenu
          iconOnly
          label={`Account: ${displayName}`}
          disabled={false}
          triggerClassName={`top-header-account${view === 'profile' ? ' active' : ''}`}
          icon={<span aria-hidden="true">{initials(displayName)}</span>}
          actions={[
            { key: 'profile', label: 'Profile', icon: <UserRound size={15} aria-hidden="true" />, onSelect: () => onNavigate('profile') },
            { key: 'logout', label: 'Sign out', icon: <LogOut size={15} aria-hidden="true" />, onSelect: onLogout },
          ]}
        />
      </div>
    </header>
  )
}

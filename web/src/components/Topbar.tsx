import { FolderOpen, LayoutDashboard, LogOut, Search, X } from 'lucide-react'
import type { FormEvent } from 'react'

type View = 'dashboard' | 'browse'

interface RailProps {
  username: string
  view: View
  onNavigate: (view: View) => void
  onLogout: () => void
}

export function Topbar({ username, view, onNavigate, onLogout }: RailProps) {
  return (
    <aside className="rail">
      <div className="rail-brand">Zapis</div>
      <nav className="rail-nav" aria-label="Views">
        <button
          type="button"
          className={`rail-link${view === 'dashboard' ? ' active' : ''}`}
          aria-current={view === 'dashboard' ? 'page' : undefined}
          onClick={() => onNavigate('dashboard')}
        >
          <LayoutDashboard size={17} aria-hidden="true" />
          Overview
        </button>
        <button
          type="button"
          className={`rail-link${view === 'browse' ? ' active' : ''}`}
          aria-current={view === 'browse' ? 'page' : undefined}
          onClick={() => onNavigate('browse')}
        >
          <FolderOpen size={17} aria-hidden="true" />
          Documents
        </button>
      </nav>
      <div className="rail-user">
        <span className="rail-username" title={username}>
          {username}
        </span>
        <button type="button" className="rail-link" onClick={onLogout}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  )
}

interface SearchProps {
  searchQuery: string
  hasSearchResults: boolean
  onSearchQueryChange: (value: string) => void
  onSearchSubmit: (e: FormEvent) => void
  onClearSearch: () => void
}

export function SearchBar({ searchQuery, hasSearchResults, onSearchQueryChange, onSearchSubmit, onClearSearch }: SearchProps) {
  return (
    <form className="search" onSubmit={onSearchSubmit} role="search">
      <div className="search-field">
        <Search size={17} className="search-field-icon" aria-hidden="true" />
        <input
          placeholder="Search names and contents of every document"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          aria-label="Search all documents"
        />
      </div>
      <button type="submit" className="btn btn-primary">
        Search
      </button>
      {hasSearchResults && (
        <button type="button" className="btn btn-ghost" onClick={onClearSearch}>
          <X size={14} aria-hidden="true" />
          Clear
        </button>
      )}
    </form>
  )
}

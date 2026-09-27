import { LogOut, Search, X } from 'lucide-react'
import type { FormEvent } from 'react'

interface Props {
  username: string
  searchQuery: string
  hasSearchResults: boolean
  onSearchQueryChange: (value: string) => void
  onSearchSubmit: (e: FormEvent) => void
  onClearSearch: () => void
  onLogout: () => void
}

export function Topbar({
  username,
  searchQuery,
  hasSearchResults,
  onSearchQueryChange,
  onSearchSubmit,
  onClearSearch,
  onLogout,
}: Props) {
  return (
    <header className="topbar">
      <h1>Document Workspace</h1>
      <form className="search" onSubmit={onSearchSubmit} role="search">
        <div className="search-field">
          <Search size={16} className="search-field-icon" aria-hidden="true" />
          <input
            placeholder="Search all documents…"
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
      <div className="user-menu">
        <span className="username">{username}</span>
        <button type="button" className="btn btn-ghost" onClick={onLogout}>
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </header>
  )
}

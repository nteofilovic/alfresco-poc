import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Bell, Search, X } from 'lucide-react'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

interface Props {
  searchQuery: string
  hasSearchResults: boolean
  onSearchQueryChange: (value: string) => void
  onSearchSubmit: (e: FormEvent) => void
  onClearSearch: () => void
  /** Unseen notices; shows a dot on the bell. */
  notificationCount: number
  /** Popover content for the bell (the activity list); `close` dismisses the popover, e.g. after navigating. */
  notifications: (close: () => void) => ReactNode
}

/** Top bar: global search (Enter submits, Ctrl/⌘+K focuses), and notifications. */
export function Topbar({
  searchQuery,
  hasSearchResults,
  onSearchQueryChange,
  onSearchSubmit,
  onClearSearch,
  notificationCount,
  notifications,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <header className="topbar">
      <form className="search" onSubmit={onSearchSubmit} role="search">
        <label className="search-field">
          <Search size={18} strokeWidth={1.8} className="search-field-icon" aria-hidden="true" />
          <span className="sr-only">Search documents</span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search names, contents and tags…"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && (searchQuery || hasSearchResults)) {
                e.preventDefault()
                onClearSearch()
              }
            }}
          />
          {searchQuery || hasSearchResults ? (
            <button type="button" className="search-clear" onClick={onClearSearch} aria-label="Clear search" title="Clear search">
              <X size={15} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="kbd" aria-hidden="true">
              {IS_MAC ? '⌘ K' : 'Ctrl K'}
            </kbd>
          )}
        </label>
      </form>

      <div className="topbar-actions">
        <NotificationsButton count={notificationCount}>{notifications}</NotificationsButton>
      </div>
    </header>
  )
}

/** Bell button with a non-modal popover; closes on outside click or Esc. */
function NotificationsButton({ count, children }: { count: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary btn-icon btn-lg notif-button"
        aria-label={count > 0 ? `Notifications (${count} new)` : 'Notifications'}
        title="Notifications"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
        {count > 0 && <span className="notif-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div id={panelId} className="notif-panel" role="dialog" aria-label="Notifications">
          <p className="notif-title">Notifications</p>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, MoreHorizontal, X } from 'lucide-react'

interface Crumb {
  id: string
  name: string
}

interface Props {
  breadcrumb: Crumb[]
  searchResults: { query: string; count: number } | null
  onNavigate: (index: number) => void
  onClearSearch?: () => void
}

// Paths longer than this collapse their middle segments into an overflow menu.
const MAX_VISIBLE = 4

export function Breadcrumbs({ breadcrumb, searchResults, onNavigate, onClearSearch }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuRef.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  if (searchResults) {
    return (
      <div className="crumbs">
        <div className="crumbs-heading">
          <h2 className="crumbs-title">
            Search results for &ldquo;{searchResults.query}&rdquo;
          </h2>
          <span className="crumbs-count">{searchResults.count}</span>
          {onClearSearch && (
            <button type="button" className="crumbs-back" onClick={onClearSearch}>
              <X size={15} aria-hidden="true" />
              Clear search
            </button>
          )}
        </div>
      </div>
    )
  }

  const lastIndex = breadcrumb.length - 1
  const collapse = breadcrumb.length > MAX_VISIBLE
  // Keep the root and the last two levels visible; everything between goes in the menu.
  const hidden = collapse ? breadcrumb.slice(1, lastIndex - 1).map((c, i) => ({ crumb: c, index: i + 1 })) : []
  const visible = breadcrumb
    .map((crumb, index) => ({ crumb, index }))
    .filter(({ index }) => !collapse || index === 0 || index >= lastIndex - 1)

  return (
    <div className="crumbs">
      <div className="crumbs-heading">
        {lastIndex > 0 && (
          <button
            type="button"
            className="crumbs-up"
            onClick={() => onNavigate(lastIndex - 1)}
            aria-label={`Back to ${breadcrumb[lastIndex - 1].name}`}
            title={`Back to ${breadcrumb[lastIndex - 1].name}`}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        )}

        <nav aria-label="Breadcrumb" className="crumbs-nav">
          <ol>
            {visible.map(({ crumb, index }) => {
              const current = index === lastIndex
              return (
                <li key={crumb.id} className="crumb-item">
                  {index > 0 && <ChevronRight size={14} className="crumb-sep" aria-hidden="true" />}
                  {current ? (
                    <h2 className="crumb-current" aria-current="page" title={crumb.name}>
                      {crumb.name}
                    </h2>
                  ) : (
                    <button type="button" className="crumb-link" onClick={() => onNavigate(index)} title={crumb.name}>
                      {crumb.name}
                    </button>
                  )}
                  {collapse && index === 0 && (
                    <>
                      <ChevronRight size={14} className="crumb-sep" aria-hidden="true" />
                      <span className="crumb-overflow" ref={menuRef}>
                        <button
                          type="button"
                          className="crumb-link crumb-more"
                          aria-haspopup="true"
                          aria-expanded={menuOpen}
                          aria-label={`Show ${hidden.length} hidden folders`}
                          onClick={() => setMenuOpen((o) => !o)}
                        >
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </button>
                        {menuOpen && (
                          <ul className="crumb-menu">
                            {hidden.map(({ crumb: h, index: hi }) => (
                              <li key={h.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuOpen(false)
                                    onNavigate(hi)
                                  }}
                                >
                                  {h.name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
      </div>
    </div>
  )
}

import { ChevronRight } from 'lucide-react'

interface Crumb {
  id: string
  name: string
}

interface Props {
  breadcrumb: Crumb[]
  searchResults: { query: string; count: number } | null
  onNavigate: (index: number) => void
}

export function Breadcrumbs({ breadcrumb, searchResults, onNavigate }: Props) {
  if (searchResults) {
    return (
      <div className="breadcrumb">
        <span>
          Search results for &ldquo;{searchResults.query}&rdquo; ({searchResults.count})
        </span>
      </div>
    )
  }

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {breadcrumb.map((c, i) => (
        <span key={c.id} className="breadcrumb-item">
          {i > 0 && <ChevronRight size={14} className="sep" aria-hidden="true" />}
          <button
            type="button"
            className="link"
            onClick={() => onNavigate(i)}
            aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}
          >
            {c.name}
          </button>
        </span>
      ))}
    </nav>
  )
}

interface Crumb {
  id: string
  name: string
}

interface Props {
  breadcrumb: Crumb[]
  searchResults: { query: string; count: number } | null
  onNavigate: (index: number) => void
}

// The path is drawn as file-folder tabs: each ancestor sits behind the current folder,
// and the current folder is the tab joined to the sheet below.
export function Breadcrumbs({ breadcrumb, searchResults, onNavigate }: Props) {
  if (searchResults) {
    return (
      <div className="tabs" role="presentation">
        <span className="tab tab-current">
          Results for &ldquo;{searchResults.query}&rdquo;
          <span className="tab-count">{searchResults.count}</span>
        </span>
      </div>
    )
  }

  return (
    <nav className="tabs" aria-label="Folder path">
      {breadcrumb.map((c, i) => {
        const current = i === breadcrumb.length - 1
        return (
          <button
            key={c.id}
            type="button"
            className={`tab${current ? ' tab-current' : ''}`}
            onClick={() => onNavigate(i)}
            aria-current={current ? 'page' : undefined}
            title={c.name}
          >
            <span className="tab-label">{c.name}</span>
          </button>
        )
      })}
    </nav>
  )
}

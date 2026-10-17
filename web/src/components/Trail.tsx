import { ChevronRight } from 'lucide-react'

export interface TrailItem {
  label: string
  /** Omitted for the current place (the last item). */
  onClick?: () => void
}

/** Where the user is, as a clickable trail (Spaces / Properties / Test Property); the last item is the current page. */
export function Trail({ items, chevrons = false }: { items: TrailItem[]; chevrons?: boolean }) {
  const last = items.length - 1
  return (
    <nav className="trail" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {i > 0 &&
              (chevrons ? (
                <ChevronRight size={14} className="trail-sep" aria-hidden="true" />
              ) : (
                <span className="trail-sep" aria-hidden="true">
                  /
                </span>
              ))}
            {i === last || !item.onClick ? (
              <span className={i === last ? 'trail-current' : undefined} aria-current={i === last ? 'page' : undefined}>
                {item.label}
              </span>
            ) : (
              <button type="button" className="trail-link" onClick={item.onClick}>
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

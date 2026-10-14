import { spaceColor } from '../spaceColor'

/** A space's monogram: its initial on the space's color. Decorative; the name is always shown beside it. */
export function SpaceMark({ id, title, size = 'md' }: { id: string; title: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`space-mark space-mark-${size}`} style={spaceColor(id)} aria-hidden="true">
      {title.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

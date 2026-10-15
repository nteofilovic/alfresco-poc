import { spaceColor } from '../spaceColor'

interface Props {
  id: string
  title: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** White tile with a colored ring, for sitting on a colored band (cards, the space header). */
  onColor?: boolean
}

/** A space's monogram: its initial in the space's color. Decorative; the name is always shown beside it. */
export function SpaceMark({ id, title, size = 'md', onColor = false }: Props) {
  return (
    <span className={`space-mark space-mark-${size}${onColor ? ' space-mark-on-color' : ''}`} style={spaceColor(id)} aria-hidden="true">
      {title.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

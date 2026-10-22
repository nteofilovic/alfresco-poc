import { initials } from '../formatters'

export const AVATAR_TONES = 6

/** Round initials badge; `tone` picks one of the colours defined as `.task-avatar.tone-N`. */
export function Avatar({ name, tone, small }: { name: string; tone: number; small?: boolean }) {
  return (
    <span className={`task-avatar tone-${tone}${small ? ' small' : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

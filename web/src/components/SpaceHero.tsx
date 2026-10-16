import { ArrowLeft } from 'lucide-react'
import type { Space } from '../api'
import { roleLabel } from '../spaceRoles'
import { spaceColor } from '../spaceColor'
import { SpaceMark } from './SpaceMark'

/** Header of an open space: its color, name, description and your role, with the way back to all spaces. */
export function SpaceHero({ space, onBack }: { space: Space; onBack: () => void }) {
  return (
    <header className="space-hero" style={spaceColor(space.id)}>
      <button type="button" className="space-hero-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" />
        All spaces
      </button>
      <div className="space-hero-main">
        <SpaceMark id={space.id} title={space.title} size="xl" onColor />
        <div className="space-hero-text">
          <h1 className="space-hero-title">{space.title}</h1>
          {space.description && <p className="space-hero-desc">{space.description}</p>}
        </div>
        <span className="space-hero-role" title="Your role in this space">
          {roleLabel(space.role)}
        </span>
      </div>
    </header>
  )
}

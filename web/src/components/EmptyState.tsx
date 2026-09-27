import type { ComponentType } from 'react'

interface Props {
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  title: string
  description?: string
}

export function EmptyState({ icon: Icon, title, description }: Props) {
  return (
    <div className="empty-state">
      <Icon size={40} className="empty-state-icon" aria-hidden="true" />
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
    </div>
  )
}

import { Loader2 } from 'lucide-react'

interface Props {
  size?: number
  label?: string
}

export function Spinner({ size = 16, label }: Props) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <Loader2 size={size} className="spinner-icon" aria-hidden="true" />
      {label ? <span className="spinner-label">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  )
}

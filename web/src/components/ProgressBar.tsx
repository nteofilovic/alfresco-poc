interface Props {
  /** Accessible name, e.g. "Merging 3 files". */
  label: string
  /** 0-100. Omit for an indeterminate bar (no aria-valuenow is exposed then). */
  value?: number
}

/** Thin progress bar. Indeterminate unless `value` is given. */
export function ProgressBar({ label, value }: Props) {
  const determinate = value !== undefined
  const pct = determinate ? Math.min(100, Math.max(0, value)) : undefined
  return (
    <div
      className={`progress-bar${determinate ? '' : ' progress-indeterminate'}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={pct}
    >
      <span className="progress-fill" style={determinate ? { width: `${pct}%` } : undefined} />
    </div>
  )
}

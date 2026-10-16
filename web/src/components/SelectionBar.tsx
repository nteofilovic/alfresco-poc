import type { MenuAction } from './ActionsMenu'

interface Props {
  count: number
  actions: MenuAction[]
  onClear: () => void
}

/** Dark toolbar shown while rows are selected: the count, the bulk actions and Clear. */
export function SelectionBar({ count, actions, onClear }: Props) {
  return (
    <div className="selection-bar" role="toolbar" aria-label="Selection actions">
      <span className="selection-count" aria-live="polite">
        {count} selected
      </span>
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          className={`selection-action${a.danger ? ' danger' : ''}`}
          disabled={a.disabled}
          title={a.disabled ? a.hint : undefined}
          onClick={a.onSelect}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
      <button type="button" className="selection-action selection-clear" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

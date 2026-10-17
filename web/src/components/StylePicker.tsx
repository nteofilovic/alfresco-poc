import { useId } from 'react'
import type { AppStyle } from '../api'
import { APP_STYLES } from '../appStyles'

/** Wireframe thumbnail of a layout, drawn in the app's own tokens. */
function StyleSketch({ style }: { style: AppStyle }) {
  const rows = [0, 1, 2, 3]
  return (
    <svg className="style-sketch" viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <rect className="sk-ground" x="0" y="0" width="160" height="100" rx="6" />
      {style === 'three-pane' ? (
        <>
          <rect className="sk-panel" x="0" y="0" width="34" height="100" rx="6" />
          <rect className="sk-accent" x="7" y="10" width="20" height="5" rx="2.5" />
          {[24, 32, 40].map((y) => (
            <rect key={y} className="sk-line" x="7" y={y} width="18" height="3" rx="1.5" />
          ))}
          <rect className="sk-panel" x="40" y="8" width="72" height="84" rx="4" />
          {rows.map((i) => (
            <rect key={i} className={i === 1 ? 'sk-accent-soft' : 'sk-line'} x="46" y={18 + i * 16} width="60" height={i === 1 ? 9 : 4} rx="2" />
          ))}
          <rect className="sk-panel" x="118" y="8" width="36" height="84" rx="4" />
          <rect className="sk-line" x="124" y="16" width="24" height="18" rx="2" />
          <rect className="sk-line" x="124" y="40" width="20" height="3" rx="1.5" />
          <rect className="sk-line" x="124" y="48" width="16" height="3" rx="1.5" />
        </>
      ) : (
        <>
          <rect className="sk-panel" x="0" y="0" width="160" height="18" rx="6" />
          <rect className="sk-accent" x="7" y="6.5" width="5" height="5" rx="1.5" />
          {[18, 34, 50].map((x) => (
            <rect key={x} className="sk-line" x={x} y="7.5" width="12" height="3" rx="1.5" />
          ))}
          <rect className="sk-command" x="76" y="4.5" width="62" height="9" rx="4.5" />
          <rect className="sk-panel" x="8" y="26" width="144" height="66" rx="4" />
          {rows.map((i) => (
            <rect key={i} className={i === 1 ? 'sk-accent-soft' : 'sk-line'} x="16" y={36 + i * 14} width="128" height={i === 1 ? 8 : 4} rx="2" />
          ))}
        </>
      )}
    </svg>
  )
}

interface Props {
  /** Accessible name of the group. */
  label: string
  value: AppStyle | null
  onChange: (style: AppStyle) => void
  disabled?: boolean
  /** Marks the option the application uses by default. */
  defaultStyle?: AppStyle
}

/** Radio group of layouts, each option a card with a wireframe thumbnail. */
export function StylePicker({ label, value, onChange, disabled = false, defaultStyle }: Props) {
  const name = useId()
  return (
    <div className="style-picker" role="radiogroup" aria-label={label}>
      {APP_STYLES.map((s) => (
        <label key={s.value} className={`style-option${value === s.value ? ' checked' : ''}${disabled ? ' disabled' : ''}`}>
          <input
            type="radio"
            name={name}
            value={s.value}
            checked={value === s.value}
            disabled={disabled}
            onChange={() => onChange(s.value)}
          />
          <StyleSketch style={s.value} />
          <span className="style-option-text">
            <span className="style-option-name">
              {s.label}
              {defaultStyle === s.value && <span className="style-option-tag">Default</span>}
            </span>
            <span className="style-option-desc">{s.description}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

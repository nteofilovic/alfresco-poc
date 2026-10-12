import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { ChevronDown, Ellipsis } from 'lucide-react'

export interface MenuAction {
  key: string
  label: string
  icon: ReactNode
  danger?: boolean
  /** Stays in the menu (focusable, announced as disabled) but does nothing; `hint` explains why. */
  disabled?: boolean
  hint?: string
  onSelect: () => void
}

interface Props {
  label: string
  disabled: boolean
  disabledHint?: string
  actions: MenuAction[]
  /** Compact "⋯" icon trigger with the menu aligned to its right edge (per-row menus). `label` becomes its accessible name. */
  iconOnly?: boolean
}

/** Menu-button pattern: arrow keys move, Home/End jump, Esc closes and returns focus, outside click closes. */
export function ActionsMenu({ label, disabled, disabledHint, actions, iconOnly = false }: Props) {
  const [openState, setOpen] = useState(false)
  const open = openState && !disabled // the menu can become disabled while open (selection cleared)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function openAt(index: number) {
    setOpen(true)
    requestAnimationFrame(() => itemRefs.current[index]?.focus())
  }

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      openAt(0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      openAt(actions.length - 1)
    }
  }

  function onMenuKey(e: KeyboardEvent) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const focusAt = (n: number) => {
      e.preventDefault()
      items[(n + items.length) % items.length]?.focus()
    }
    if (e.key === 'ArrowDown') focusAt(i + 1)
    else if (e.key === 'ArrowUp') focusAt(i - 1)
    else if (e.key === 'Home') focusAt(0)
    else if (e.key === 'End') focusAt(items.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={iconOnly ? 'icon-button' : 'btn btn-secondary'}
        aria-label={iconOnly ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        title={disabled ? disabledHint : iconOnly ? label : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onButtonKey}
      >
        {iconOnly ? (
          <Ellipsis size={16} aria-hidden="true" />
        ) : (
          <>
            {label}
            <ChevronDown size={15} aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className={`menu${iconOnly ? ' menu-right' : ''}`} onKeyDown={onMenuKey}>
          {actions.map((a, i) => (
            <button
              key={a.key}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`menu-item${a.danger ? ' danger' : ''}`}
              aria-disabled={a.disabled || undefined}
              title={a.disabled ? a.hint : undefined}
              onClick={() => {
                if (a.disabled) return
                setOpen(false)
                a.onSelect()
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

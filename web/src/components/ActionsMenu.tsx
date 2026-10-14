import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { ChevronDown, EllipsisVertical } from 'lucide-react'

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
  /** Compact icon trigger with the menu aligned to its right edge (per-row menus). `label` becomes its accessible name. */
  iconOnly?: boolean
  /** Icon for an `iconOnly` trigger; defaults to the vertical "⋮". */
  icon?: ReactNode
  /** Extra class for the trigger button. */
  triggerClassName?: string
  /** Content of a text trigger; defaults to `label` plus a chevron. */
  children?: ReactNode
}

const ITEM_HEIGHT = 40
const MENU_WIDTH = 200 // matches .menu min-width

/**
 * Menu-button pattern: arrow keys move, Home/End jump, Esc closes and returns focus, outside click closes.
 * The menu is fixed-positioned from the trigger's rect so scrolling containers (the file table card) never clip it,
 * and it opens upwards when there is no room below.
 */
export function ActionsMenu({ label, disabled, disabledHint, actions, iconOnly = false, icon, triggerClassName, children }: Props) {
  const [openState, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({})
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
    // A fixed menu would drift away from its trigger on scroll/resize; close it instead.
    const onMove = (e: Event) => {
      if (!(e.target instanceof Node && wrapRef.current?.contains(e.target))) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  function place() {
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const height = actions.length * ITEM_HEIGHT + 12
    const up = r.bottom + height > window.innerHeight && r.top > height
    const vertical: CSSProperties = up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }
    const alignRight = iconOnly || r.left + 220 > window.innerWidth
    // Right-aligned would run off the left edge (narrow rail next to the preview): open rightwards instead.
    const fitsLeft = r.right - MENU_WIDTH >= 8
    const horizontal: CSSProperties =
      alignRight && fitsLeft ? { right: window.innerWidth - r.right } : { left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8)) }
    setPosition({ ...vertical, ...horizontal })
  }

  function openAt(index: number) {
    place()
    setOpen(true)
    requestAnimationFrame(() => itemRefs.current[index]?.focus({ preventScroll: true }))
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
        className={triggerClassName ?? (iconOnly ? 'icon-button' : 'btn btn-secondary')}
        aria-label={iconOnly ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        title={disabled ? disabledHint : iconOnly ? label : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onButtonKey}
      >
        {iconOnly
          ? (icon ?? <EllipsisVertical size={16} aria-hidden="true" />)
          : (children ?? (
              <>
                {label}
                <ChevronDown size={15} aria-hidden="true" />
              </>
            ))}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className="menu" style={position} onKeyDown={onMenuKey}>
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

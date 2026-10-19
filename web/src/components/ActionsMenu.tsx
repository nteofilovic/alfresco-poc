import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { ChevronDown, ChevronRight, EllipsisVertical } from 'lucide-react'

export interface MenuAction {
  key: string
  label: string
  icon: ReactNode
  danger?: boolean
  /** Stays in the menu (focusable, announced as disabled) but does nothing; `hint` explains why. */
  disabled?: boolean
  hint?: string
  onSelect: () => void
  /** Turns the item into a submenu: it opens on hover, focus-click or ArrowRight and `onSelect` is unused. */
  submenu?: MenuAction[]
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
  /** Called each time the menu opens, e.g. to look up which optional items to offer. */
  onOpen?: () => void
}

const ITEM_HEIGHT = 40
const MENU_WIDTH = 200 // matches .menu min-width

/**
 * Menu-button pattern: arrow keys move, Home/End jump, Esc closes and returns focus, outside click closes.
 * The menu is fixed-positioned from the trigger's rect so scrolling containers (the file table card) never clip it,
 * and it opens upwards when there is no room below.
 */
export function ActionsMenu({ label, disabled, disabledHint, actions, iconOnly = false, icon, triggerClassName, children, onOpen }: Props) {
  const [openState, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({})
  const [subOpen, setSubOpen] = useState<string | null>(null)
  const [subLeft, setSubLeft] = useState(false)
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
    onOpen?.()
    requestAnimationFrame(() => itemRefs.current[index]?.focus({ preventScroll: true }))
  }

  function close(returnFocus: boolean) {
    setOpen(false)
    setSubOpen(null)
    if (returnFocus) buttonRef.current?.focus()
  }

  function openSub(key: string, wrap: HTMLElement | null, focusFirst: boolean) {
    const r = wrap?.getBoundingClientRect()
    if (r) setSubLeft(r.right + MENU_WIDTH > window.innerWidth && r.left - MENU_WIDTH >= 8)
    setSubOpen(key)
    if (focusFirst) requestAnimationFrame(() => wrap?.querySelector<HTMLButtonElement>('.menu-sub [role="menuitem"]')?.focus())
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
    const inSub = (e.target as HTMLElement).closest('.menu-sub')
    if (inSub) {
      // Keys inside a submenu stay inside it; Left/Esc return to the parent item.
      const subItems = Array.from(inSub.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      const j = subItems.indexOf(document.activeElement as HTMLButtonElement)
      const move = (n: number) => {
        e.preventDefault()
        subItems[(n + subItems.length) % subItems.length]?.focus()
      }
      if (e.key === 'ArrowDown') move(j + 1)
      else if (e.key === 'ArrowUp') move(j - 1)
      else if (e.key === 'Home') move(0)
      else if (e.key === 'End') move(subItems.length - 1)
      else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        inSub.closest('.menu-sub-wrap')?.querySelector<HTMLButtonElement>(':scope > [role="menuitem"]')?.focus()
        setSubOpen(null)
      } else if (e.key === 'Tab') setOpen(false)
      return
    }
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
    else if (e.key === 'ArrowRight' && actions.some((a) => a.submenu && a.key === document.activeElement?.getAttribute('data-key'))) {
      e.preventDefault()
      const el = document.activeElement as HTMLElement
      openSub(el.getAttribute('data-key')!, el.parentElement, true)
    } else if (e.key === 'Escape') {
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
          {actions.map((a, i) => {
            const item = (
              <button
                key={a.key}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="menuitem"
                data-key={a.key}
                tabIndex={-1}
                className={`menu-item${a.danger ? ' danger' : ''}`}
                aria-disabled={a.disabled || undefined}
                aria-haspopup={a.submenu ? 'menu' : undefined}
                aria-expanded={a.submenu ? subOpen === a.key : undefined}
                title={a.disabled ? a.hint : undefined}
                onClick={(e) => {
                  if (a.disabled) return
                  if (a.submenu) return openSub(a.key, e.currentTarget.parentElement, false)
                  setOpen(false)
                  a.onSelect()
                }}
              >
                {a.icon}
                {a.label}
                {a.submenu && <ChevronRight size={15} className="menu-item-chevron" aria-hidden="true" />}
              </button>
            )
            if (!a.submenu) return item
            return (
              <div
                key={a.key}
                className="menu-sub-wrap"
                onMouseEnter={(e) => !a.disabled && openSub(a.key, e.currentTarget, false)}
                onMouseLeave={() => setSubOpen((k) => (k === a.key ? null : k))}
              >
                {item}
                {subOpen === a.key && !a.disabled && (
                  <div role="menu" aria-label={a.label} className={`menu menu-sub${subLeft ? ' menu-sub-left' : ''}`}>
                    {a.submenu.map((sa) => (
                      <button
                        key={sa.key}
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        className="menu-item"
                        onClick={() => {
                          setOpen(false)
                          setSubOpen(null)
                          sa.onSelect()
                        }}
                      >
                        {sa.icon}
                        {sa.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'

export interface Command {
  id: string
  /** Heading the command is listed under (Go to, Spaces, Create...). */
  group: string
  label: string
  /** Secondary text on the right, e.g. where a document lives. */
  hint?: string
  icon: ReactNode
  /** Extra words the filter matches on. */
  keywords?: string
  run: () => void
}

interface Props {
  commands: Command[]
  /** Text the field starts with (the active search, so it can be refined). */
  initialQuery: string
  /** Full-text search across all spaces the user can read. */
  onSearch: (query: string) => void
  onClose: () => void
}

const SEARCH_ID = 'search'

function matches(command: Command, words: string[]) {
  const haystack = `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase()
  return words.every((w) => haystack.includes(w))
}

/**
 * Command palette (combobox + listbox on a modal <dialog>): typing filters the commands; with text, the first
 * entry searches documents for it. Arrow keys move, Enter runs, Esc or a click outside closes.
 */
export function CommandPalette({ commands, initialQuery, onSearch, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const listId = useId()
  const optionId = (i: number) => `${listId}-opt-${i}`

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const items = useMemo(() => {
    const q = query.trim()
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const found = commands.filter((c) => matches(c, words))
    if (!q) return found
    const search: Command = {
      id: SEARCH_ID,
      group: 'Search',
      label: `Search documents for “${q}”`,
      hint: 'Names, contents and tags in all your spaces',
      icon: <Search size={16} aria-hidden="true" />,
      run: () => onSearch(q),
    }
    return [search, ...found]
  }, [commands, query, onSearch])

  const current = Math.min(active, Math.max(items.length - 1, 0))

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  function run(command: Command | undefined) {
    if (!command) return
    onClose()
    command.run()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(items[current])
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-label="Search and commands"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="palette-field">
        <Search size={18} strokeWidth={1.9} aria-hidden="true" />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items.length > 0 ? optionId(current) : undefined}
          aria-label="Search documents or type a command"
          placeholder="Search documents or type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <kbd className="kbd" aria-hidden="true">
          Esc
        </kbd>
      </div>

      <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="palette-list">
        {items.length === 0 && (
          <li className="palette-empty" role="presentation">
            No command matches. Type a word from a document name or its contents and press Enter to search.
          </li>
        )}
        {items.map((c, i) => {
          const heading = i === 0 || items[i - 1].group !== c.group ? c.group : null
          return (
            <li key={c.id} role="presentation">
              {heading && (
                <div className="palette-group" aria-hidden="true">
                  {heading}
                </div>
              )}
              <div
                id={optionId(i)}
                data-index={i}
                role="option"
                aria-selected={i === current}
                className={`palette-option${i === current ? ' active' : ''}`}
                onMouseMove={() => i !== current && setActive(i)}
                onClick={() => run(c)}
              >
                <span className="palette-option-icon">{c.icon}</span>
                <span className="palette-option-label">{c.label}</span>
                {c.hint && <span className="palette-option-hint">{c.hint}</span>}
                {i === current && <CornerDownLeft size={14} className="palette-option-enter" aria-hidden="true" />}
              </div>
            </li>
          )
        })}
      </ul>
    </dialog>
  )
}

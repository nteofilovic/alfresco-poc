import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Space } from '../api'
import { FolderTemplatesAdmin } from './FolderTemplatesAdmin'
import { SpacesAdmin } from './SpacesAdmin'
import { UsersAdmin } from './UsersAdmin'

type Section = 'spaces' | 'users'

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'spaces', label: 'Spaces' },
  { value: 'users', label: 'Users' },
]

const SECTION_KEY = 'zapis.adminSection'

function savedSection(): Section {
  try {
    const saved = localStorage.getItem(SECTION_KEY)
    return SECTIONS.some((s) => s.value === saved) ? (saved as Section) : 'spaces'
  } catch {
    return 'spaces'
  }
}

/** Administration: one sub-view at a time (Spaces, Users) behind tabs; the last tab used is remembered. */
export function AdministrationPage({
  spaces,
  onSpacesChanged,
  onTemplatesChanged,
}: {
  spaces: Space[] | null
  onSpacesChanged: () => void
  /** Folder templates changed: the New menu in the spaces must pick them up. */
  onTemplatesChanged: () => void
}) {
  const [section, setSection] = useState<Section>(savedSection)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function choose(next: Section) {
    setSection(next)
    try {
      localStorage.setItem(SECTION_KEY, next)
    } catch {
      // private mode / blocked storage: the tab still works, it just isn't remembered
    }
  }

  function onKeyDown(e: KeyboardEvent, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = SECTIONS[(index + (e.key === 'ArrowRight' ? 1 : SECTIONS.length - 1)) % SECTIONS.length]
    choose(next.value)
    tabRefs.current[next.value]?.focus()
  }

  return (
    <section className="folder" aria-labelledby="admin-heading">
      <div className="page-head">
        <h1 id="admin-heading">Administration</h1>
        <p>Create spaces and folder templates, choose who belongs to each space, and manage who can sign in.</p>
      </div>

      <div className="task-tabs admin-tabs" role="tablist" aria-label="Administration sections">
        {SECTIONS.map((s, i) => (
          <button
            key={s.value}
            ref={(el) => {
              tabRefs.current[s.value] = el
            }}
            type="button"
            role="tab"
            id={`admin-tab-${s.value}`}
            aria-selected={section === s.value}
            aria-controls="admin-panel"
            tabIndex={section === s.value ? 0 : -1}
            className={`task-tab${section === s.value ? ' active' : ''}`}
            onClick={() => choose(s.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="sheet admin-sheet" role="tabpanel" id="admin-panel" aria-labelledby={`admin-tab-${section}`}>
        {section === 'spaces' ? (
          <>
            <SpacesAdmin spaces={spaces} onChanged={onSpacesChanged} />
            <FolderTemplatesAdmin onChanged={onTemplatesChanged} />
          </>
        ) : (
          <UsersAdmin />
        )}
      </div>
    </section>
  )
}

import { useState } from 'react'
import { Folder, FolderPlus, Plus, X } from 'lucide-react'
import type { Draft } from './folderDraft'

const ROOT = 'root'
const ILLEGAL = /[\\/*?:"<>|]/

function insert(nodes: Draft[], parentId: string, child: Draft): Draft[] {
  if (parentId === ROOT) return [...nodes, child]
  return nodes.map((n) => (n.id === parentId ? { ...n, children: [...n.children, child] } : { ...n, children: insert(n.children, parentId, child) }))
}

function remove(nodes: Draft[], id: string): Draft[] {
  return nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: remove(n.children, id) }))
}

function NameInput({ taken, onSubmit, onCancel }: { taken: string[]; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const name = value.trim()
    if (!name) return setError('Enter a folder name.')
    if (ILLEGAL.test(name)) return setError('A name cannot contain \\ / * ? : " < > |')
    if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return setError('This folder already exists here.')
    onSubmit(name)
  }

  return (
    <div className="ws-name-form">
      <input
        autoFocus
        value={value}
        placeholder="Folder name"
        aria-label="Folder name"
        aria-invalid={!!error}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault() // would otherwise submit the surrounding dialog form
            submit()
          } else if (e.key === 'Escape') {
            e.preventDefault() // cancel only this input, not the dialog
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      <button type="button" className="btn btn-primary" onClick={submit}>
        Add
      </button>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
      {error && (
        <p className="ws-name-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

interface TreeProps {
  nodes: Draft[]
  adding: string | null
  onStartAdd: (parentId: string) => void
  onAdd: (parentId: string, name: string) => void
  onCancel: () => void
  onRemove: (id: string) => void
}

function Tree({ nodes, adding, onStartAdd, onAdd, onCancel, onRemove }: TreeProps) {
  return (
    <ul className="ws-tree">
      {nodes.map((n) => (
        <li key={n.id}>
          <div className="ws-node">
            <button
              type="button"
              className="ws-node-main"
              onClick={() => onStartAdd(n.id)}
              aria-label={`Add a sub-folder to ${n.name}`}
              title="Click to add a sub-folder"
            >
              <Folder size={16} aria-hidden="true" />
              <span>{n.name}</span>
              <Plus size={14} className="ws-node-plus" aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" onClick={() => onRemove(n.id)} aria-label={`Remove ${n.name}`}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          {(n.children.length > 0 || adding === n.id) && (
            <div className="ws-children">
              {n.children.length > 0 && (
                <Tree nodes={n.children} adding={adding} onStartAdd={onStartAdd} onAdd={onAdd} onCancel={onCancel} onRemove={onRemove} />
              )}
              {adding === n.id && (
                <NameInput taken={n.children.map((c) => c.name)} onSubmit={(name) => onAdd(n.id, name)} onCancel={onCancel} />
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Editable folder tree: add a folder, click a folder to add sub-folders under it, remove with the X. */
export function FolderTreeEditor({ value, onChange, addLabel = 'Add folder' }: { value: Draft[]; onChange: (next: Draft[]) => void; addLabel?: string }) {
  const [adding, setAdding] = useState<string | null>(null)

  function add(parentId: string, name: string) {
    onChange(insert(value, parentId, { id: crypto.randomUUID(), name, children: [] }))
    setAdding(null)
  }

  return (
    <div className="ws-builder">
      {value.length > 0 && (
        <Tree
          nodes={value}
          adding={adding}
          onStartAdd={setAdding}
          onAdd={add}
          onCancel={() => setAdding(null)}
          onRemove={(id) => onChange(remove(value, id))}
        />
      )}
      {adding === ROOT ? (
        <NameInput taken={value.map((n) => n.name)} onSubmit={(name) => add(ROOT, name)} onCancel={() => setAdding(null)} />
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setAdding(ROOT)}>
          <FolderPlus size={15} aria-hidden="true" />
          {addLabel}
        </button>
      )}
    </div>
  )
}

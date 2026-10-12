import { useState } from 'react'
import type { FormEvent } from 'react'
import { Folder, FolderPlus, Plus, X } from 'lucide-react'
import { api, type FolderTemplateNode, type Workspace } from '../api'
import { apiErrorMessage } from '../formatters'

interface Draft {
  id: string
  name: string
  children: Draft[]
}

const ROOT = 'root'
const ILLEGAL = /[\\/*?:"<>|]/

function insert(nodes: Draft[], parentId: string, child: Draft): Draft[] {
  if (parentId === ROOT) return [...nodes, child]
  return nodes.map((n) => (n.id === parentId ? { ...n, children: [...n.children, child] } : { ...n, children: insert(n.children, parentId, child) }))
}

function remove(nodes: Draft[], id: string): Draft[] {
  return nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: remove(n.children, id) }))
}

function toPayload(nodes: Draft[]): FolderTemplateNode[] {
  return nodes.map((n) => ({ name: n.name, children: toPayload(n.children) }))
}

function NameInput({ taken, onSubmit, onCancel }: { taken: string[]; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const name = value.trim()
    if (!name) return setError('Enter a folder name.')
    if (ILLEGAL.test(name)) return setError('A name cannot contain \\ / * ? : " < > |')
    if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return setError('This folder already exists here.')
    onSubmit(name)
  }

  return (
    <form className="ws-name-form" onSubmit={submit}>
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
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <button type="submit" className="btn btn-primary">
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
    </form>
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

export function WorkspaceBuilder({ workspace, onCreated }: { workspace: Workspace | null; onCreated: (w: Workspace) => void }) {
  const [tree, setTree] = useState<Draft[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function add(parentId: string, name: string) {
    setTree((t) => insert(t, parentId, { id: crypto.randomUUID(), name, children: [] }))
    setAdding(null)
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.createWorkspace(toPayload(tree)))
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-users">
      <h3>Workspace folders</h3>
      {workspace === null ? (
        <p className="admin-form-hint">Loading…</p>
      ) : workspace.exists ? (
        <p className="admin-success">
          The workspace has been created. Users see its folders on the Workspace page.
        </p>
      ) : (
        <>
          <p className="admin-form-hint">
            Design the folder structure users will see. Add a folder, then click any folder to add sub-folders under it. Nothing is
            created until you press Create.
          </p>
          <div className="ws-builder">
            {tree.length > 0 && (
              <Tree
                nodes={tree}
                adding={adding}
                onStartAdd={setAdding}
                onAdd={add}
                onCancel={() => setAdding(null)}
                onRemove={(id) => setTree((t) => remove(t, id))}
              />
            )}
            {adding === ROOT ? (
              <NameInput taken={tree.map((n) => n.name)} onSubmit={(name) => add(ROOT, name)} onCancel={() => setAdding(null)} />
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(ROOT)}>
                <FolderPlus size={15} aria-hidden="true" />
                Add
              </button>
            )}
          </div>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="btn btn-primary ws-create" disabled={busy || tree.length === 0} onClick={create}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      )}
    </div>
  )
}

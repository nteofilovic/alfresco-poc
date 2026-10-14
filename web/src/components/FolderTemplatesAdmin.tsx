import { useEffect, useState } from 'react'
import { Plus, Shapes } from 'lucide-react'
import { api, type FolderTemplate, type FolderTemplateNode } from '../api'
import { apiErrorMessage } from '../formatters'
import { ConfirmDialog } from './ConfirmDialog'
import { DialogShell } from './DialogShell'
import { EmptyState } from './EmptyState'
import { FolderTreeEditor } from './FolderTreeEditor'
import { fromPayload, toPayload, type Draft } from './folderDraft'

function countFolders(nodes: FolderTemplateNode[]): number {
  return nodes.reduce((n, f) => n + 1 + countFolders(f.children ?? []), 0)
}

/** Create or edit one template: its name (what members pick, e.g. "Client") and the subfolders every instance gets. */
function TemplateDialog({
  template,
  onSaved,
  onCancel,
}: {
  /** Null when creating. */
  template: FolderTemplate | null
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [tree, setTree] = useState<Draft[]>(() => fromPayload(template?.folders ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    const body = { name: name.trim(), description: description.trim(), folders: toPayload(tree) }
    try {
      if (template) await api.updateFolderTemplate(template.id, body)
      else await api.createFolderTemplate(body)
      onSaved()
    } catch (err) {
      setError(String(err).includes('409') ? 'A template with this name already exists.' : apiErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title={template ? `Edit template “${template.name}”` : 'New folder template'}
      confirmLabel={template ? 'Save template' : 'Create template'}
      busyLabel="Saving…"
      busy={busy}
      confirmDisabled={!name.trim()}
      wide
      onConfirm={save}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. Client, Property, Owner"
          required
          autoFocus
        />
      </label>
      <label className="dialog-field">
        Description
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="Optional. Helps members pick the right template"
        />
      </label>
      <div className="dialog-field">
        <span>Subfolders</span>
        <p className="admin-form-hint">
          Created inside every {name.trim() || 'item'} members add, and fixed for them. Add a folder, then click a folder to add
          sub-folders under it.
        </p>
        <FolderTreeEditor value={tree} onChange={setTree} addLabel="Add subfolder" />
      </div>
      <p className="dialog-error" role="alert">
        {error}
      </p>
    </DialogShell>
  )
}

/** Admin: the folder templates members create things from (Client, Property, Owner...), shared by every space. */
export function FolderTemplatesAdmin({ onChanged }: { onChanged: () => void }) {
  const [templates, setTemplates] = useState<FolderTemplate[] | null>(null)
  const [editing, setEditing] = useState<FolderTemplate | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<FolderTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    api
      .listFolderTemplates()
      .then((list) => {
        setTemplates(list)
        setError(null)
      })
      .catch((e) => {
        setTemplates([])
        setError(apiErrorMessage(e))
      })
  }, [reloadKey])

  const reload = () => {
    setReloadKey((k) => k + 1)
    onChanged()
  }

  async function remove(template: FolderTemplate) {
    try {
      await api.deleteFolderTemplate(template.id)
      reload()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setToDelete(null)
    }
  }

  return (
    <div className="admin-users">
      <div className="admin-toolbar">
        <div className="admin-heading-block">
          <h3>Folder templates</h3>
          <p className="admin-form-hint">
            What members can create inside a space, such as a Client, Property or Owner. Each one becomes a folder with the
            subfolders you define here. Templates apply to every space; folders already created are not changed.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={15} aria-hidden="true" />
          New template
        </button>
      </div>

      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
      {templates === null && !error && <p className="admin-form-hint">Loading…</p>}
      {templates && templates.length === 0 && !error && (
        <EmptyState
          icon={Shapes}
          title="No folder templates yet"
          description="Create one, for example “Client” with Contracts and Invoices subfolders, so members can add clients themselves."
        />
      )}
      {templates && templates.length > 0 && (
        <table className="admin-user-table">
          <thead>
            <tr>
              <th>Template</th>
              <th>Subfolders</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.name}
                  {t.description && <div className="admin-form-hint">{t.description}</div>}
                </td>
                <td>{t.folders.length === 0 ? 'None' : t.folders.map((f) => f.name).join(', ')}
                  {countFolders(t.folders) > t.folders.length && (
                    <span className="admin-form-hint"> ({countFolders(t.folders)} in total)</span>
                  )}
                </td>
                <td className="admin-user-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(t)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setToDelete(t)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <TemplateDialog
          key={editing === 'new' ? 'new' : editing.id}
          template={editing === 'new' ? null : editing}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title={`Delete template “${toDelete.name}”?`}
          message="Members can no longer create new ones from it. Folders already created from it stay as they are."
          confirmLabel="Delete template"
          onConfirm={() => remove(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}

import { Fragment, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { FolderOpen, Plus } from 'lucide-react'
import { api, type ManagedUser, type Space, type SpaceMember, type SpaceRole } from '../api'
import { apiErrorMessage } from '../formatters'
import { ConfirmDialog } from './ConfirmDialog'
import { DialogShell } from './DialogShell'
import { EmptyState } from './EmptyState'
import { SpaceMark } from './SpaceMark'

const ROLES: { value: SpaceRole; label: string }[] = [
  { value: 'SiteManager', label: 'Manager' },
  { value: 'SiteCollaborator', label: 'Collaborator' },
  { value: 'SiteContributor', label: 'Contributor' },
  { value: 'SiteConsumer', label: 'Viewer' },
]

function MembersPanel({ space }: { space: Space }) {
  const [members, setMembers] = useState<SpaceMember[] | null>(null)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<SpaceRole>('SiteCollaborator')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.listSpaceMembers(space.id), api.listUsers()])
      .then(([m, u]) => {
        setMembers(m)
        setUsers(u.filter((x) => x.enabled))
      })
      .catch((e) => {
        setMembers([])
        setError(apiErrorMessage(e))
      })
  }, [space.id])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setMembers(await api.listSpaceMembers(space.id))
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const memberNames = new Set((members ?? []).map((m) => m.username))
  const candidates = users.filter((u) => !memberNames.has(u.username))

  return (
    <div className="space-members">
      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
      {members === null ? (
        <p className="admin-form-hint">Loading…</p>
      ) : (
        <table className="admin-user-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.username}>
                <td>
                  {m.displayName} <span className="admin-form-hint">({m.username})</span>
                </td>
                <td>
                  <select
                    value={m.role}
                    disabled={busy}
                    aria-label={`Role of ${m.username}`}
                    onChange={(e) => run(() => api.addSpaceMember(space.id, m.username, e.target.value as SpaceRole))}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="admin-user-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => run(() => api.removeSpaceMember(space.id, m.username))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="admin-form-row"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          run(() => api.addSpaceMember(space.id, username, role)).then(() => setUsername(''))
        }}
      >
        <select value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Person to add" required>
          <option value="" disabled>
            Add a person…
          </option>
          {candidates.map((u) => (
            <option key={u.username} value={u.username}>
              {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username} ({u.username})
            </option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value as SpaceRole)} aria-label="Role">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary" disabled={busy || !username}>
          Add
        </button>
      </form>
    </div>
  )
}

function SpaceList({
  spaces,
  open,
  onToggle,
  onChanged,
  onCreate,
}: {
  spaces: Space[]
  open: string | null
  onToggle: (id: string) => void
  onChanged: () => void
  onCreate: () => void
}) {
  const [toDelete, setToDelete] = useState<Space | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(space: Space) {
    try {
      await api.deleteSpace(space.id)
      onChanged()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setToDelete(null)
    }
  }

  if (spaces.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No spaces yet"
        description="A space is one area of your company, such as Clients or Finance."
        action={
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            <Plus size={15} aria-hidden="true" />
            New space
          </button>
        }
      />
    )
  }

  return (
    <>
      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
      <table className="admin-user-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Visibility</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {spaces.map((s) => (
            <Fragment key={s.id}>
              <tr>
                <td>
                  <span className="space-name-cell">
                    <SpaceMark id={s.id} title={s.title} size="sm" />
                    {s.title} <span className="admin-form-hint">({s.id})</span>
                  </span>
                </td>
                <td>
                  <span className="pill">{VISIBILITY_LABEL[s.visibility] ?? s.visibility}</span>
                </td>
                <td className="admin-user-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    aria-expanded={open === s.id}
                    onClick={() => onToggle(s.id)}
                  >
                    {open === s.id ? 'Hide members' : 'Members'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setToDelete(s)}>
                    Delete
                  </button>
                </td>
              </tr>
              {open === s.id && (
                <tr>
                  <td colSpan={3}>
                    <MembersPanel space={s} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.title}?`}
          message="The space and every document in it will be permanently removed. This cannot be undone."
          confirmLabel="Delete space"
          onConfirm={() => remove(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  )
}

const VISIBILITY_LABEL: Record<string, string> = {
  PRIVATE: 'Members only',
  MODERATED: 'Findable by everyone',
  PUBLIC: 'Readable by everyone',
}

/** Name, description and visibility of a new space. State is local, so a cancelled draft is dropped. */
function CreateSpaceDialog({ onCreated, onCancel }: { onCreated: (space: Space) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'PRIVATE' | 'MODERATED' | 'PUBLIC'>('PRIVATE')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.createSpace({ title: title.trim(), description: description.trim(), visibility }))
    } catch (err) {
      setError(String(err).includes('409') ? 'A space with this name already exists.' : apiErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title="New space"
      confirmLabel="Create space"
      busyLabel="Creating…"
      busy={busy}
      confirmDisabled={!title.trim()}
      wide
      onConfirm={create}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        Name
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required autoFocus />
      </label>
      <label className="dialog-field">
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </label>
      <label className="dialog-field">
        Who can see it
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
          <option value="PRIVATE">Members only</option>
          <option value="MODERATED">Everyone can find it, members read it</option>
          <option value="PUBLIC">Everyone can read it</option>
        </select>
      </label>
      <p className="dialog-error" role="alert">
        {error}
      </p>
    </DialogShell>
  )
}

/** Admin: the spaces table (members expand inline) and a dialog that creates a space with its sections. */
export function SpacesAdmin({ spaces, onChanged }: { spaces: Space[] | null; onChanged: () => void }) {
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  return (
    <div className="admin-users">
      <div className="admin-toolbar">
        <div className="admin-heading-block">
          <h3>Spaces</h3>
          <p className="admin-form-hint">
            A space is one area of your company (Clients, Suppliers, Finance…). Only its members can see its documents.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} aria-hidden="true" />
          New space
        </button>
      </div>
      {created && <div className="admin-success">Space “{created}” created. Add its members below.</div>}
      {spaces === null ? (
        <p className="admin-form-hint">Loading…</p>
      ) : (
        <SpaceList
          spaces={spaces}
          open={open}
          onToggle={(id) => setOpen((o) => (o === id ? null : id))}
          onChanged={onChanged}
          onCreate={() => setCreating(true)}
        />
      )}
      {creating && (
        <CreateSpaceDialog
          onCreated={(space) => {
            setCreating(false)
            setCreated(space.title)
            setOpen(space.id)
            onChanged()
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  )
}

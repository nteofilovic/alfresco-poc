import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import { api, type ManagedUser, type NewUser } from '../api'
import { apiErrorMessage } from '../formatters'
import { ConfirmDialog } from './ConfirmDialog'
import { DialogShell } from './DialogShell'
import { EmptyState } from './EmptyState'

const EMPTY: NewUser = { username: '', firstName: '', lastName: '', email: '', password: '' }

function errorMessage(e: unknown): string {
  if (String(e).includes('409')) return 'A user with this username already exists.'
  return apiErrorMessage(e)
}

function CreateUserDialog({ onCreated, onCancel }: { onCreated: (username: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState<NewUser>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof NewUser) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const user = await api.createUser({ ...form, username: form.username.trim(), email: form.email.trim() })
      onCreated(user.username)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title="New user"
      confirmLabel="Create user"
      busyLabel="Creating…"
      busy={busy}
      confirmDisabled={!form.username.trim() || !form.firstName.trim() || !form.email.trim() || !form.password}
      wide
      onConfirm={create}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        Username
        <input value={form.username} onChange={set('username')} autoComplete="off" required autoFocus />
      </label>
      <div className="task-field-row">
        <label className="dialog-field">
          First name
          <input value={form.firstName} onChange={set('firstName')} required />
        </label>
        <label className="dialog-field">
          Last name
          <input value={form.lastName} onChange={set('lastName')} />
        </label>
      </div>
      <label className="dialog-field">
        Email
        <input type="email" value={form.email} onChange={set('email')} required />
      </label>
      <label className="dialog-field">
        Initial password
        <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
      </label>
      <p className="dialog-error" role="alert">
        {error}
      </p>
    </DialogShell>
  )
}

/** Admin: searchable users table with block/unblock/delete, and a dialog to add a user. */
export function UsersAdmin() {
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<ManagedUser | null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    api
      .listUsers()
      .then((list) => {
        setUsers(list)
        setError(null)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [reloadKey])

  async function run(username: string, action: () => Promise<void>) {
    setPending(username)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(null)
    }
  }

  const toggle = (u: ManagedUser) =>
    run(u.username, async () => {
      const updated = await api.setUserEnabled(u.username, !u.enabled)
      setUsers((list) => list?.map((x) => (x.username === u.username ? updated : x)) ?? null)
    })

  const remove = (u: ManagedUser) =>
    run(u.username, async () => {
      await api.deleteUser(u.username)
      setUsers((list) => list?.filter((x) => x.username !== u.username) ?? null)
    }).finally(() => setToDelete(null))

  const needle = query.trim().toLowerCase()
  const visible = (users ?? []).filter(
    (u) => !needle || [u.username, u.firstName, u.lastName, u.email].some((v) => v.toLowerCase().includes(needle)),
  )

  return (
    <div className="admin-users">
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users…"
            aria-label="Search users"
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} aria-hidden="true" />
          New user
        </button>
      </div>

      {created && <div className="admin-success">User “{created}” created.</div>}
      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
      {users === null && !error && <p className="admin-form-hint">Loading…</p>}
      {users && visible.length === 0 && (
        <EmptyState
          icon={Users}
          title={needle ? 'No users match your search' : 'No users yet'}
          description={needle ? 'Try a different name or email.' : 'Use “New user” to add the first one.'}
        />
      )}
      {users && visible.length > 0 && (
        <table className="admin-user-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>First name</th>
              <th>Last name</th>
              <th>Email</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.username} className={u.enabled ? undefined : 'admin-user-blocked'}>
                <td>
                  {u.username}
                  {!u.enabled && <span className="admin-user-badge">Blocked</span>}
                </td>
                <td>{u.firstName}</td>
                <td>{u.lastName}</td>
                <td>{u.email}</td>
                <td className="admin-user-actions">
                  <button
                    className="btn btn-secondary"
                    disabled={u.protectedAccount || pending === u.username}
                    title={u.protectedAccount ? 'This account cannot be blocked' : undefined}
                    onClick={() => toggle(u)}
                  >
                    {u.enabled ? 'Block' : 'Unblock'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={u.protectedAccount || pending === u.username}
                    title={u.protectedAccount ? 'This account cannot be deleted' : undefined}
                    onClick={() => setToDelete(u)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <CreateUserDialog
          onCreated={(username) => {
            setCreating(false)
            setCreated(username)
            setReloadKey((k) => k + 1)
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.username}?`}
          message={`${[toDelete.firstName, toDelete.lastName].filter(Boolean).join(' ') || toDelete.username} will be permanently removed from the repository. This cannot be undone.`}
          confirmLabel="Delete user"
          onConfirm={() => remove(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}

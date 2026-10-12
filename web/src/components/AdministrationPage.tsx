import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { api, type ManagedUser, type NewUser, type Workspace } from '../api'
import { WorkspaceBuilder } from './WorkspaceBuilder'
import { apiErrorMessage } from '../formatters'
import { ConfirmDialog } from './ConfirmDialog'

const EMPTY: NewUser = { username: '', firstName: '', lastName: '', email: '', password: '' }

function errorMessage(e: unknown): string {
  if (String(e).includes('409')) return 'A user with this username already exists.'
  return apiErrorMessage(e)
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<NewUser>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const set = (field: keyof NewUser) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setCreated(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setCreated(null)
    try {
      const user = await api.createUser({ ...form, username: form.username.trim(), email: form.email.trim() })
      setCreated(user.username)
      setForm(EMPTY)
      onCreated()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <h3>Create user</h3>
      <label>
        Username
        <input value={form.username} onChange={set('username')} autoComplete="off" required />
      </label>
      <div className="admin-form-row">
        <label>
          First name
          <input value={form.firstName} onChange={set('firstName')} required />
        </label>
        <label>
          Last name
          <input value={form.lastName} onChange={set('lastName')} />
        </label>
      </div>
      <label>
        Email
        <input type="email" value={form.email} onChange={set('email')} required />
      </label>
      <label>
        Initial password
        <input
          type="password"
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          required
        />
      </label>
      {error && <div className="login-error">{error}</div>}
      {created && <div className="admin-success">User “{created}” created.</div>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create user'}
      </button>
    </form>
  )
}

function UserList({ refreshKey }: { refreshKey: number }) {
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<ManagedUser | null>(null)

  useEffect(() => {
    api
      .listUsers()
      .then((list) => {
        setUsers(list)
        setError(null)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [refreshKey])

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

  return (
    <div className="admin-users">
      <h3>Users</h3>
      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
      {users === null && !error && <p className="admin-form-hint">Loading…</p>}
      {users && (
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
            {users.map((u) => (
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

export function AdministrationPage({
  workspace,
  onWorkspaceCreated,
}: {
  workspace: Workspace | null
  onWorkspaceCreated: (w: Workspace) => void
}) {
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <section className="folder">
      <div className="sheet admin-sheet">
        <WorkspaceBuilder workspace={workspace} onCreated={onWorkspaceCreated} />
        <CreateUserForm onCreated={() => setRefreshKey((k) => k + 1)} />
        <UserList refreshKey={refreshKey} />
      </div>
    </section>
  )
}

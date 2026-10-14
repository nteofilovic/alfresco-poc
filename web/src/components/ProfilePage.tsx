import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { api, type Profile } from '../api'
import { apiErrorMessage } from '../formatters'
import { Spinner } from './Spinner'

interface Props {
  username: string
  onProfileUpdated: (profile: Profile) => void
}

type Details = Pick<Profile, 'firstName' | 'lastName' | 'email'>

function ProfileForm({ username, onProfileUpdated }: Props) {
  const [form, setForm] = useState<Details | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .getProfile()
      .then((p) => setForm({ firstName: p.firstName, lastName: p.lastName, email: p.email }))
      .catch((e) => setError(apiErrorMessage(e)))
  }, [])

  const set = (field: keyof Details) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => (f ? { ...f, [field]: e.target.value } : f))
    setSaved(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await api.updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
      })
      setForm({ firstName: updated.firstName, lastName: updated.lastName, email: updated.email })
      setSaved(true)
      onProfileUpdated(updated)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!form) {
    return error ? <div className="login-error" role="alert">{error}</div> : <Spinner size={20} label="Loading profile…" />
  }

  return (
    <form className="admin-form" onSubmit={submit} aria-labelledby="profile-details-title">
      <h3 id="profile-details-title">Your details</h3>
      <p className="admin-form-hint">Signed in as {username}</p>
      <div className="admin-form-row">
        <label>
          First name
          <input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" required />
        </label>
        <label>
          Last name
          <input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
        </label>
      </div>
      <label>
        Email
        <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
      </label>
      {error && <div className="login-error" role="alert">{error}</div>}
      {saved && <div className="admin-success" role="status">Profile updated.</div>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm

  const on = (setter: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value)
    setChanged(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (next !== confirm) return
    setBusy(true)
    setError(null)
    setChanged(false)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setChanged(true)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-form" onSubmit={submit} aria-labelledby="profile-password-title">
      <h3 id="profile-password-title">Change password</h3>
      <label>
        Current password
        <input type="password" value={current} onChange={on(setCurrent)} autoComplete="current-password" required />
      </label>
      <label>
        New password
        <input type="password" value={next} onChange={on(setNext)} autoComplete="new-password" required />
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          value={confirm}
          onChange={on(setConfirm)}
          autoComplete="new-password"
          aria-invalid={mismatch}
          aria-describedby={mismatch ? 'password-mismatch' : undefined}
          required
        />
      </label>
      {mismatch && (
        <div id="password-mismatch" className="login-error" role="alert">
          Passwords do not match.
        </div>
      )}
      {error && <div className="login-error" role="alert">{error}</div>}
      {changed && <div className="admin-success" role="status">Password changed.</div>}
      <button className="btn btn-primary" type="submit" disabled={busy || mismatch}>
        {busy ? 'Changing…' : 'Change password'}
      </button>
    </form>
  )
}

export function ProfilePage({ username, onProfileUpdated }: Props) {
  return (
    <section className="folder" aria-labelledby="profile-heading">
      <div className="page-head">
        <h1 id="profile-heading">Profile</h1>
      </div>
      <div className="sheet admin-sheet profile-sheet">
        <ProfileForm username={username} onProfileUpdated={onProfileUpdated} />
        <PasswordForm />
      </div>
    </section>
  )
}

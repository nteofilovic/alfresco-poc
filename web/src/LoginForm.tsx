import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, Lock, User } from 'lucide-react'
import { api } from './api'
import { Spinner } from './components/Spinner'

interface Props {
  onLoggedIn: (username: string) => void
}

export function LoginForm({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const user = await api.login(username, password)
      onLoggedIn(user.username)
    } catch {
      setError('Invalid username or password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-brand">
        <h1>Zapis</h1>
        <p className="login-subtitle">File, find and merge your documents in one place.</p>
      </div>

      <div className="login-card">
        <h2 className="login-title">Sign in</h2>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="login-username">Username</label>
          <div className="input-with-icon">
            <User size={16} aria-hidden="true" />
            <input
              id="login-username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <label htmlFor="login-password">Password</label>
          <div className="input-with-icon">
            <Lock size={16} aria-hidden="true" />
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="login-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !username || !password}>
            {submitting ? <Spinner size={15} label="Signing in…" /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

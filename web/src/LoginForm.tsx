import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react'
import { api, type AuthUser } from './api'
import { Spinner } from './components/Spinner'

interface Props {
  onLoggedIn: (user: AuthUser) => void
}

/** The formats Zapis handles, settled into one tidy stack behind a single document. */
const FORMATS = ['tiff', 'jpg', 'xlsx', 'docx', 'pdf']

export function LoginForm({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const user = await api.login(username, password)
      onLoggedIn(user)
    } catch (err) {
      // api.ts throws "<status> <text>: <body>"; 401 means the credentials were wrong, anything else is the server.
      setError(
        err instanceof Error && err.message.startsWith('401')
          ? 'The username or password is incorrect. Check them and try again.'
          : 'Zapis can’t reach the server right now. Try again in a moment.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <section className="login-brand">
        <div className="login-wordmark">
          <span className="login-logo" aria-hidden="true">
            Z
          </span>
        </div>

        <div className="login-stack" aria-hidden="true">
          {FORMATS.map((ext, i) => (
            <div key={ext} className={`login-sheet login-sheet-${i}`}>
              <span className="login-sheet-ext">.{ext}</span>
              <span className="login-sheet-line" />
              <span className="login-sheet-line short" />
            </div>
          ))}
          <div className="login-sheet login-sheet-merged">
            <span className="login-sheet-ext">Report.pdf</span>
            <span className="login-sheet-line" />
            <span className="login-sheet-line" />
            <span className="login-sheet-line" />
            <span className="login-sheet-line short" />
          </div>
        </div>

        <h1 className="login-headline">
          <span className="login-headline-name">Zapis</span>
          <span className="login-headline-tagline">Document management, made simple.</span>
        </h1>
      </section>

      <section className="login-card">
        <div className="login-panel">
          <h2 className="login-title">Sign in</h2>
          <p className="login-hint">Use your username and password.</p>

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
                spellCheck={false}
                autoCapitalize="none"
              />
            </div>

            <label htmlFor="login-password">Password</label>
            <div className="input-with-icon">
              <Lock size={16} aria-hidden="true" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="input-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
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
      </section>
    </div>
  )
}

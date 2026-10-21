import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { api, type AuthUser } from './api'
import { LayersMark } from './components/LayersMark'
import { Spinner } from './components/Spinner'

interface Props {
  onLoggedIn: (user: AuthUser) => void
}

/** The isometric archive: [centre x, centre y, colour] per slab, painted back to front. */
const SLABS: [number, number, string][] = [
  [360, 150, '#1E6B52'],
  [360, 136, '#2B8064'],
  [314, 173, '#2B8064'],
  [314, 159, '#A8C9B8'],
  [406, 173, '#0F3D2E'],
  [406, 159, '#DDF0E6'],
  [406, 145, '#5FA585'],
  [268, 196, '#A8C9B8'],
  [360, 196, '#DDF0E6'],
  [360, 182, '#5FA585'],
  [452, 196, '#1E6B52'],
  [452, 182, '#2B8064'],
  [452, 168, '#A8C9B8'],
  [222, 219, '#0F3D2E'],
  [222, 205, '#DDF0E6'],
  [222, 191, '#5FA585'],
  [222, 177, '#1E6B52'],
  [222, 163, '#2B8064'],
  [314, 219, '#5FA585'],
  [406, 219, '#2B8064'],
  [406, 205, '#A8C9B8'],
  [406, 191, '#0F3D2E'],
  [406, 177, '#DDF0E6'],
  [498, 219, '#0F3D2E'],
  [498, 205, '#DDF0E6'],
  [498, 191, '#5FA585'],
  [498, 177, '#1E6B52'],
  [176, 242, '#DDF0E6'],
  [176, 228, '#5FA585'],
  [176, 214, '#1E6B52'],
  [268, 242, '#1E6B52'],
  [360, 242, '#A8C9B8'],
  [360, 228, '#0F3D2E'],
  [452, 242, '#DDF0E6'],
  [452, 228, '#5FA585'],
  [452, 214, '#1E6B52'],
  [452, 200, '#2B8064'],
  [544, 242, '#1E6B52'],
  [222, 265, '#2B8064'],
  [314, 265, '#0F3D2E'],
  [406, 265, '#5FA585'],
  [406, 251, '#1E6B52'],
  [498, 265, '#2B8064'],
  [498, 251, '#A8C9B8'],
  [268, 288, '#DDF0E6'],
  [268, 274, '#5FA585'],
  [360, 288, '#1E6B52'],
  [360, 274, '#2B8064'],
  [452, 288, '#A8C9B8'],
  [452, 274, '#0F3D2E'],
  [314, 311, '#2B8064'],
  [314, 297, '#A8C9B8'],
  [406, 311, '#0F3D2E'],
  [360, 334, '#DDF0E6'],
  [360, 320, '#5FA585'],
  [360, 306, '#1E6B52'],
  [360, 292, '#2B8064'],
  [360, 278, '#A8C9B8'],
]

const HALF_W = 40
const HALF_H = 19
const DEPTH = 12

/** The two palest slabs would blend into the light green panel, so they are pushed apart: both a step deeper. */
const TUNE: Record<string, string> = { '#A8C9B8': '#86BB9F', '#DDF0E6': '#C6E7D5' }

function Slab({ x, y, fill: base, order }: { x: number; y: number; fill: string; order: number }) {
  const fill = TUNE[base] ?? base
  const left = `${x - HALF_W},${y} ${x},${y + HALF_H} ${x},${y + HALF_H + DEPTH} ${x - HALF_W},${y + DEPTH}`
  const right = `${x + HALF_W},${y} ${x},${y + HALF_H} ${x},${y + HALF_H + DEPTH} ${x + HALF_W},${y + DEPTH}`
  const top = `${x},${y - HALF_H} ${x + HALF_W},${y} ${x},${y + HALF_H} ${x - HALF_W},${y}`
  return (
    <g className="login-slab" style={{ '--i': order } as CSSProperties}>
      <polygon points={left} fill={fill} />
      <polygon points={left} fill="rgba(0,0,0,.12)" />
      <polygon points={right} fill={fill} />
      <polygon points={right} fill="rgba(0,0,0,.28)" />
      <polygon points={top} fill={fill} />
      <line x1={x - 32} y1={y + 4} x2={x - 8} y2={y + 17} stroke="rgba(255,255,255,.35)" strokeWidth="1" />
    </g>
  )
}

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
            <LayersMark size={22} />
          </span>
          Zapis
        </div>

        <svg className="login-art" viewBox="100 20 520 400" aria-hidden="true">
          {SLABS.map(([x, y, fill], i) => (
            <Slab key={`${x}-${y}`} x={x} y={y} fill={fill} order={i} />
          ))}
        </svg>

        <div>
          <div className="login-copy">
            <p className="login-lead">Your whole company archive, in order.</p>
            <h1 className="login-headline">Document management, made simple.</h1>
          </div>
          <div className="login-stats">
            <div>
              <b>All files</b>
              <span>in one place</span>
            </div>
            <div>
              <b>Every team</b>
              <span>its own space</span>
            </div>
            <div>
              <b>Full text</b>
              <span>search included</span>
            </div>
          </div>
        </div>
      </section>

      <section className="login-card">
        <div className="login-panel">
          <h2 className="login-title">Sign in</h2>
          <p className="login-hint">Welcome back. Enter your details to open your workspace.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-username">Username</label>
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

            <div>
              <label htmlFor="login-password">Password</label>
              <div className="login-password">
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
            </div>

            {error && (
              <div className="login-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                {error}
              </div>
            )}

            <button type="submit" className="login-submit" disabled={submitting || !username || !password}>
              {submitting ? <Spinner size={15} label="Signing in…" /> : 'Sign in'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

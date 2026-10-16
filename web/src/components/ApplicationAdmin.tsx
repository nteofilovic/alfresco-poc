import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, type AppearanceSettings } from '../api'
import { styleLabel } from '../appStyles'
import { apiErrorMessage } from '../formatters'
import { Spinner } from './Spinner'
import { StylePicker } from './StylePicker'

/** Application-wide settings: the default layout and whether people may choose their own in their profile. */
export function ApplicationAdmin({ onChanged }: { onChanged: () => void }) {
  const [saved, setSaved] = useState<AppearanceSettings | null>(null)
  const [draft, setDraft] = useState<AppearanceSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    api
      .getAppearanceSettings()
      .then((s) => {
        setSaved(s)
        setDraft(s)
      })
      .catch((e) => setError(apiErrorMessage(e)))
  }, [])

  const dirty = !!saved && !!draft && (saved.defaultStyle !== draft.defaultStyle || saved.allowUserChoice !== draft.allowUserChoice)

  function edit(change: Partial<AppearanceSettings>) {
    setDraft((d) => (d ? { ...d, ...change } : d))
    setStatus(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const updated = await api.updateAppearanceSettings(draft)
      setSaved(updated)
      setDraft(updated)
      setStatus(
        updated.allowUserChoice
          ? `Saved. ${styleLabel(updated.defaultStyle)} is the default; people can choose their own layout in their profile.`
          : `Saved. Everyone now uses the ${styleLabel(updated.defaultStyle)} layout.`,
      )
      onChanged()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!draft) {
    return error ? <div className="login-error" role="alert">{error}</div> : <Spinner size={20} label="Loading settings…" />
  }

  return (
    <form className="admin-form appearance-form" onSubmit={submit} aria-labelledby="app-appearance-title">
      <h3 id="app-appearance-title">Layout</h3>
      <p className="admin-form-hint">The layout everyone sees unless they choose their own.</p>
      <StylePicker
        label="Default layout"
        value={draft.defaultStyle}
        disabled={busy}
        onChange={(defaultStyle) => edit({ defaultStyle })}
      />
      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.allowUserChoice}
          disabled={busy}
          onChange={(e) => edit({ allowUserChoice: e.target.checked })}
        />
        <span>
          <span className="check-row-title">Let people choose their own layout</span>
          <span className="check-row-hint">
            {draft.allowUserChoice
              ? 'Each person can pick a layout under Profile. Those who have not picked one follow the default.'
              : 'Everyone uses the default layout. Choices people made earlier are kept and apply again if you turn this back on.'}
          </span>
        </span>
      </label>
      {error && <div className="login-error" role="alert">{error}</div>}
      {status && <div className="admin-success" role="status">{status}</div>}
      <button className="btn btn-primary" type="submit" disabled={busy || !dirty}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}

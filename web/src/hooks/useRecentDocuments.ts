import { useCallback, useState } from 'react'

export interface RecentDocument {
  id: string
  name: string
}

const MAX = 8
const storageKey = (username: string) => `zapis.recentDocuments.${username}`

function read(username: string): RecentDocument[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(username)) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((d): d is RecentDocument => typeof d?.id === 'string' && typeof d?.name === 'string')
      : []
  } catch {
    return []
  }
}

function write(username: string, docs: RecentDocument[]) {
  try {
    localStorage.setItem(storageKey(username), JSON.stringify(docs))
  } catch {
    // storage unavailable: the list just won't persist
  }
}

/**
 * Documents the signed-in user opened in this browser, newest first. There is no "recently opened" API that
 * non-admins may call, so this is a per-browser convenience kept in localStorage.
 */
export function useRecentDocuments(username: string | null) {
  const [owner, setOwner] = useState(username)
  const [docs, setDocs] = useState<RecentDocument[]>(() => (username ? read(username) : []))

  // Another user signed in: reload their list (adjusting state during render, not in an effect).
  if (owner !== username) {
    setOwner(username)
    setDocs(username ? read(username) : [])
  }

  const update = useCallback(
    (change: (list: RecentDocument[]) => RecentDocument[]) => {
      if (!username) return
      setDocs((list) => {
        const next = change(list).slice(0, MAX)
        write(username, next)
        return next
      })
    },
    [username],
  )

  const add = useCallback(
    (doc: RecentDocument) => update((list) => [{ id: doc.id, name: doc.name }, ...list.filter((d) => d.id !== doc.id)]),
    [update],
  )

  const remove = useCallback((id: string) => update((list) => list.filter((d) => d.id !== id)), [update])

  return { docs, add, remove }
}

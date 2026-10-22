import { useEffect, useRef } from 'react'
import type { LiveEvent } from '../api'

/**
 * Subscribes to the server's push stream (`/api/notifications/stream`) while a user is signed in.
 * `EventSource` reconnects on its own after a dropped connection or an API restart; each reconnect also
 * calls `onReconnect`, since events sent while the stream was down are lost and the data may be stale.
 */
export function useLiveEvents(
  username: string | null,
  onEvent: (event: LiveEvent) => void,
  onReconnect: () => void,
) {
  // Always call the latest handlers without re-opening the stream on every render.
  const handlers = useRef({ onEvent, onReconnect })
  useEffect(() => {
    handlers.current = { onEvent, onReconnect }
  })

  useEffect(() => {
    if (!username || typeof EventSource === 'undefined') return
    const source = new EventSource('/api/notifications/stream', { withCredentials: true })
    let opened = false
    source.addEventListener('ready', () => {
      if (opened) handlers.current.onReconnect()
      opened = true
    })
    source.addEventListener('task', (e) => {
      try {
        handlers.current.onEvent(JSON.parse((e as MessageEvent<string>).data) as LiveEvent)
      } catch {
        // a malformed event is ignored
      }
    })
    return () => source.close()
  }, [username])
}

import { useCallback, useMemo, useRef, useState } from 'react'
import { api, type TaskAssignee, type TaskDto, type TaskNotification } from '../api'
import { apiErrorMessage, isOverdue } from '../formatters'

const dismissedKey = (username: string) => `zapis.dismissedAssignments.${username}`

function readDismissed(username: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(dismissedKey(username)) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeDismissed(username: string, ids: Set<string>) {
  try {
    localStorage.setItem(dismissedKey(username), JSON.stringify([...ids]))
  } catch {
    // storage unavailable: dismissals just won't persist
  }
}

const isOpen = (t: TaskDto) => !t.resolved && t.status !== 'done'

/**
 * Task activity for the signed-in user, fetched once and shared by the Workspace panel and the rail badge:
 * assignment notices (new, unresolved, not dismissed), completion notices and open/overdue counts.
 * Everything is best effort; call `refresh` when the data may have changed.
 */
export function useTaskActivity(username: string | null) {
  const [assigned, setAssigned] = useState<TaskDto[] | null>(null)
  const [completions, setCompletions] = useState<TaskNotification[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [assignees, setAssignees] = useState<TaskAssignee[]>([])
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)
  const assigneesLoaded = useRef(false)

  const refresh = useCallback(() => {
    if (!username) return
    const mine = ++seq.current
    const current = () => seq.current === mine

    api
      .listTasks('assigned')
      .then((list) => {
        if (!current()) return
        const safe = (list ?? []).filter((t) => t && t.id)
        // Forget dismissals for tasks that no longer exist.
        const existing = new Set(safe.map((t) => t.id))
        const kept = new Set([...readDismissed(username)].filter((id) => existing.has(id)))
        writeDismissed(username, kept)
        setDismissed(kept)
        setAssigned(safe)
        setFailed(false)
      })
      .catch(() => current() && setFailed(true))

    api
      .taskNotifications()
      .then((n) => current() && setCompletions((n ?? []).filter((x) => x && x.id)))
      .catch(() => {})

    if (!assigneesLoaded.current) {
      assigneesLoaded.current = true
      api
        .taskAssignees()
        .then(setAssignees)
        .catch(() => {
          assigneesLoaded.current = false
        })
    }
  }, [username])

  /** Clears everything (on sign-out) so the next user starts clean. */
  const reset = useCallback(() => {
    seq.current++
    assigneesLoaded.current = false
    setAssigned(null)
    setCompletions([])
    setDismissed(new Set())
    setAssignees([])
    setFailed(false)
  }, [])

  const names = useMemo(() => new Map(assignees.map((a) => [a.username, a.displayName])), [assignees])
  const nameOf = useCallback(
    (u: string) => (u === username ? 'you' : (names.get(u) ?? u)),
    [names, username],
  )
  /** Display name for someone else's action ("Jane"), never "you". */
  const displayNameOf = useCallback((u: string) => names.get(u) ?? u, [names])

  const newAssignments = useMemo(
    () => (assigned ?? []).filter((t) => t.status === 'new' && !t.resolved && !dismissed.has(t.id)),
    [assigned, dismissed],
  )
  const openTasks = (assigned ?? []).filter(isOpen)
  const overdueCount = openTasks.filter((t) => isOverdue(t.dueDate)).length

  const dismissAssignment = useCallback(
    (id: string) => {
      if (!username) return
      setDismissed((prev) => {
        const next = new Set(prev).add(id)
        writeDismissed(username, next)
        return next
      })
    },
    [username],
  )

  /** Returns an error message if the server call failed (the notice is restored then). */
  const dismissCompletion = useCallback(
    async (id: string): Promise<string | null> => {
      const before = completions
      setCompletions((list) => list.filter((n) => n.id !== id))
      try {
        await api.dismissTaskNotification(id)
        return null
      } catch (e) {
        setCompletions(before)
        return apiErrorMessage(e)
      }
    },
    [completions],
  )

  return {
    loaded: assigned !== null,
    failed,
    newAssignments,
    completions,
    openCount: openTasks.length,
    overdueCount,
    /** Unseen notices, for the rail badge. */
    badgeCount: newAssignments.length + completions.length,
    assignees,
    nameOf,
    displayNameOf,
    refresh,
    reset,
    dismissAssignment,
    dismissCompletion,
  }
}

export type TaskActivity = ReturnType<typeof useTaskActivity>

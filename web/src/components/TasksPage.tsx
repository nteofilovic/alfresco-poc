import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, ClipboardList, FileText, MessageCircle, Paperclip, Plus, RefreshCw } from 'lucide-react'
import {
  api,
  type LiveEvent,
  type NodeDto,
  type Space,
  type TaskAssignee,
  type TaskAttachment,
  type TaskDto,
  type TaskStatus,
} from '../api'
import { TASK_STATUSES, TASK_STATUS_LABELS, apiErrorMessage, daysUntil, dueNote, formatDay } from '../formatters'
import { spaceColor } from '../spaceColor'
import { CreateTaskDialog } from './CreateTaskDialog'
import { EmptyState } from './EmptyState'
import { Spinner } from './Spinner'
import { AVATAR_TONES, Avatar } from './TaskAvatar'
import { TaskDetail } from './TaskDetail'
import { TaskStatusChip } from './TaskStatusChip'

interface Props {
  username: string
  assignees: TaskAssignee[]
  nameOf: (username: string) => string
  /** A task to open on arrival (deep link from a notice); cleared via onPendingConsumed. */
  pendingTaskId: string | null
  onPendingConsumed: () => void
  /** Spaces the user can attach documents from (the picker starts in the chosen one). */
  spaces: Space[]
  /** Id of the document currently open in the preview pane, if it came from a task. */
  activePreviewId: string | null
  onPreview: (node: NodeDto) => void
  onError: (message: string) => void
  /** Called after a conversation was opened or written to, so the rail badge can catch up. */
  onActivityChanged: () => void
  /** The latest server push; the list and the open task refetch quietly when a new one arrives. */
  liveEvent: { seq: number; event: LiveEvent } | null
  /** The task whose conversation is open (null when none), so a push for it needs no toast. */
  onViewingTask: (taskId: string | null) => void
}

type Scope = 'assigned' | 'created' | 'all'
type GroupBy = 'due' | 'status' | 'space'

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'assigned', label: 'Assigned to me' },
  { value: 'created', label: 'Created by me' },
  { value: 'all', label: 'All' },
]

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: 'due', label: 'Group: Due date' },
  { value: 'status', label: 'Group: Status' },
  { value: 'space', label: 'Group: Space' },
]

interface TaskGroup {
  key: string
  label: string
  /** Overdue is the one group that is flagged. */
  alert?: boolean
  tasks: TaskDto[]
}

const DESCRIPTION_MAX = 40

/** The last loaded lists, so coming back to the page shows them at once while fresh ones load. */
let cached: { user: string; assigned: TaskDto[]; created: TaskDto[] } | null = null

const isFinished = (t: TaskDto) => t.resolved || t.status === 'done' || t.status === 'cancelled'

function byNewest(a: TaskDto, b: TaskDto) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

/** Soonest due first, undated last, newest first among equals. */
function byDue(a: TaskDto, b: TaskDto) {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1
  return byNewest(a, b)
}

function groupTasks(tasks: TaskDto[], by: GroupBy): TaskGroup[] {
  const groups: TaskGroup[] = []
  const put = (key: string, label: string, task: TaskDto, alert = false) => {
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, label, alert, tasks: [] }))
    g.tasks.push(task)
  }

  if (by === 'due') {
    const order = ['overdue', 'today', 'week', 'later', 'none', 'done']
    for (const t of [...tasks].sort(byDue)) {
      const days = daysUntil(t.dueDate)
      if (isFinished(t)) put('done', 'Finished', t)
      else if (days === null) put('none', 'No due date', t)
      else if (days < 0) put('overdue', 'Overdue', t, true)
      else if (days === 0) put('today', 'Today', t)
      else if (days <= 7) put('week', 'This week', t)
      else put('later', 'Later', t)
    }
    groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  } else if (by === 'status') {
    for (const t of [...tasks].sort(byDue)) put(t.status, TASK_STATUS_LABELS[t.status], t)
    groups.sort((a, b) => TASK_STATUSES.indexOf(a.key as TaskStatus) - TASK_STATUSES.indexOf(b.key as TaskStatus))
  } else {
    for (const t of [...tasks].sort(byDue)) put(t.siteId ?? '', t.siteTitle ?? 'No space', t)
    groups.sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.label.localeCompare(b.label))
  }
  return groups
}

/** One line of the description for a list row: whitespace collapsed, cut at `max` characters with an ellipsis. */
function shorten(text: string, max: number) {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max).trimEnd() + '…' : oneLine
}

function firstName(full: string) {
  return full.split(/\s+/)[0] || full
}

/** Tasks page: scope tabs, filters, grouped rows, detail and creation. */
export function TasksPage({
  username,
  assignees,
  nameOf,
  pendingTaskId,
  onPendingConsumed,
  spaces,
  activePreviewId,
  onPreview,
  onError,
  onActivityChanged,
  liveEvent,
  onViewingTask,
}: Props) {
  const [scope, setScope] = useState<Scope>('assigned')
  const fromCache = cached?.user === username ? cached : null
  const [assigned, setAssigned] = useState<TaskDto[] | null>(fromCache?.assigned ?? null)
  const [created, setCreated] = useState<TaskDto[] | null>(fromCache?.created ?? null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<TaskDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [groupBy, setGroupBy] = useState<GroupBy>('due')
  const [showDone, setShowDone] = useState(false)

  // Both lists are loaded together: the tab counts and the "All" tab need them.
  useEffect(() => {
    let cancelled = false
    Promise.all([api.listTasks('assigned'), api.listTasks('created')])
      .then(([a, c]) => {
        if (cancelled) return
        const sortedA = [...a].sort(byNewest)
        const sortedC = [...c].sort(byNewest)
        cached = { user: username, assigned: sortedA, created: sortedC }
        setAssigned(sortedA)
        setCreated(sortedC)
        setLoadError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setAssigned((prev) => prev ?? [])
        setCreated((prev) => prev ?? [])
        setLoadError(apiErrorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey, username])

  const selectedId = selected?.id ?? null
  useEffect(() => {
    onViewingTask(selectedId)
    return () => onViewingTask(null)
  }, [selectedId, onViewingTask])

  // A push arrived: refetch the lists and the open task without clearing what is on screen.
  const handledSeq = useRef(liveEvent?.seq ?? 0)
  useEffect(() => {
    if (!liveEvent || liveEvent.seq === handledSeq.current) return
    handledSeq.current = liveEvent.seq
    const { event } = liveEvent
    Promise.all([api.listTasks('assigned'), api.listTasks('created')])
      .then(([a, c]) => {
        const sortedA = [...a].sort(byNewest)
        const sortedC = [...c].sort(byNewest)
        cached = { user: username, assigned: sortedA, created: sortedC }
        setAssigned(sortedA)
        setCreated(sortedC)
      })
      .catch(() => {})
    // Messages are the conversation's own business (TaskDetail); anything else changes the task itself.
    if (event.type !== 'task-message' && event.taskId === selectedId) {
      api
        .getTask(event.taskId)
        .then(setSelected)
        .catch(() => {})
    }
  }, [liveEvent, selectedId, username])

  useEffect(() => {
    if (!pendingTaskId) return
    let cancelled = false
    api
      .getTask(pendingTaskId)
      .then((t) => !cancelled && setSelected(t))
      .catch((e) => !cancelled && onError(apiErrorMessage(e)))
      .finally(() => !cancelled && onPendingConsumed())
    return () => {
      cancelled = true
    }
  }, [pendingTaskId, onPendingConsumed, onError])

  const inScope = useMemo(() => {
    if (scope === 'assigned') return assigned ?? []
    if (scope === 'created') return created ?? []
    // A task assigned to yourself is in both lists.
    return [...new Map([...(assigned ?? []), ...(created ?? [])].map((t) => [t.id, t])).values()]
  }, [scope, assigned, created])

  const openCount = (list: TaskDto[] | null) => (list ?? []).filter((t) => !isFinished(t)).length
  const counts: Record<Scope, number> = {
    assigned: openCount(assigned),
    created: openCount(created),
    all: openCount([...new Map([...(assigned ?? []), ...(created ?? [])].map((t) => [t.id, t])).values()]),
  }

  const filtered = inScope.filter((t) => !statusFilter || t.status === statusFilter)
  const doneCount = filtered.filter(isFinished).length
  const visible = showDone ? filtered : filtered.filter((t) => !isFinished(t))
  const groups = useMemo(() => groupTasks(visible, groupBy), [visible, groupBy])

  // One colour per person across the list, in the order the directory lists them.
  const toneOf = (user: string) => Math.max(0, assignees.findIndex((a) => a.username === user)) % AVATAR_TONES

  function changeScope(next: Scope) {
    if (next === scope) return
    setScope(next)
  }

  /** The list rows carry counts only; the opened task is fetched in full (attachment names, access). */
  async function openTask(t: TaskDto) {
    if (openingId) return
    setOpeningId(t.id)
    try {
      setSelected(await api.getTask(t.id))
    } catch (e) {
      onError(apiErrorMessage(e))
    } finally {
      setOpeningId(null)
    }
  }

  function refresh() {
    setAssigned(null)
    setCreated(null)
    setLoadError(null)
    setReloadKey((k) => k + 1)
  }

  function handleUpdated(task: TaskDto) {
    setSelected(task)
    const swap = (list: TaskDto[] | null) => list && list.map((t) => (t.id === task.id ? task : t))
    setAssigned(swap)
    setCreated(swap)
  }

  function handleCreated(task: TaskDto) {
    setCreating(false)
    setCreated((list) => (list ? [task, ...list].sort(byNewest) : list))
    if (task.assignee === username) setAssigned((list) => (list ? [task, ...list].sort(byNewest) : list))
    // A task created for someone else shows under "Created by me"; switch there so the new row is visible.
    else if (scope === 'assigned') changeScope('created')
  }

  async function openAttachment(a: TaskAttachment) {
    try {
      onPreview(await api.getNode(a.id))
    } catch (e) {
      onError(`Couldn’t open ${a.name}. ${apiErrorMessage(e)}`)
    }
  }

  function renderRow(t: TaskDto) {
    const finished = isFinished(t)
    const days = daysUntil(t.dueDate)
    const overdue = !finished && days !== null && days < 0
    const other = t.creator === username ? t.assignee : t.creator
    const otherName = nameOf(other)
    const summary = shorten(t.description, DESCRIPTION_MAX)
    return (
      <li key={t.id}>
        <button
          type="button"
          className={`task-row${overdue ? ' overdue' : ''}${finished ? ' finished' : ''}`}
          aria-busy={openingId === t.id}
          onClick={() => openTask(t)}
        >
          <span className="task-row-main">
            <span className="task-row-title">
              <span className={`task-row-name${t.unreadMessages > 0 ? ' unread' : ''}`}>{t.title}</span>
              {t.siteTitle && t.siteId && (
                <span className="task-space-chip" style={spaceColor(t.siteId)}>
                  {t.siteTitle}
                </span>
              )}
              {t.unreadMessages > 0 && (
                <span className="task-row-new">
                  {t.unreadMessages} new<span className="sr-only"> messages</span>
                </span>
              )}
            </span>
            {summary && (
              <span className="task-row-preview">
                <FileText size={13} aria-hidden="true" />
                <span title={t.description}>{summary}</span>
              </span>
            )}
          </span>
          <TaskStatusChip status={t.status} />
          <span className="task-row-due">
            <span className={overdue ? 'task-overdue' : undefined}>
              <span className="sr-only">Due </span>
              {formatDay(t.dueDate)}
            </span>
            {!finished && t.dueDate && <span className={`task-row-due-note${overdue ? ' task-overdue' : ''}`}>{dueNote(t.dueDate)}</span>}
          </span>
          <span className="task-row-person">
            <Avatar name={otherName} tone={toneOf(other)} />
            <span>
              <span className="sr-only">{t.creator === username ? 'To ' : 'From '}</span>
              {firstName(otherName)}
            </span>
          </span>
          <span className="task-row-counts">
            <span title={`${t.attachments.length} attachments`}>
              <Paperclip size={14} aria-hidden="true" />
              {t.attachments.length}
              <span className="sr-only"> attachments</span>
            </span>
            <span title={`${t.messageCount} messages`}>
              <MessageCircle size={14} aria-hidden="true" />
              {t.messageCount}
              <span className="sr-only"> messages</span>
            </span>
          </span>
        </button>
      </li>
    )
  }

  const loading = assigned === null || created === null

  return (
    <section className="tasks" aria-labelledby="tasks-heading">
      <div className="tasks-head">
        <h1 id="tasks-heading">Tasks</h1>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setCreating(true)}>
          <Plus size={15} aria-hidden="true" />
          New task
        </button>
      </div>

      {selected ? (
        <div className="sheet tasks-sheet">
          <TaskDetail
            key={selected.id}
            task={selected}
            username={username}
            nameOf={nameOf}
            activeAttachmentId={activePreviewId}
            onBack={() => setSelected(null)}
            onUpdated={handleUpdated}
            onMessagesChanged={onActivityChanged}
            liveEvent={liveEvent}
            onOpenAttachment={openAttachment}
          />
        </div>
      ) : (
        <>
          <div className="task-filters">
            <div className="task-tabs" role="group" aria-label="Task scope">
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`task-tab${scope === s.value ? ' active' : ''}`}
                  aria-pressed={scope === s.value}
                  onClick={() => changeScope(s.value)}
                >
                  {s.label}
                  {!loading && s.value !== 'all' && <span className="task-tab-count">{counts[s.value]}</span>}
                </button>
              ))}
            </div>
            <label className="task-select">
              <span className="sr-only">Filter by status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}>
                <option value="">Any status</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="task-select">
              <span className="sr-only">Group tasks</span>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                {GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="task-filters-end">
              <button type="button" className="btn btn-ghost toolbar-refresh" onClick={refresh} disabled={loading}>
                <RefreshCw size={14} aria-hidden="true" />
                Refresh
              </button>
              <button
                type="button"
                className={`task-pill${showDone ? ' active' : ''}`}
                aria-pressed={showDone}
                onClick={() => setShowDone((v) => !v)}
              >
                {showDone ? 'Hide' : 'Show'} done ({doneCount})
              </button>
            </span>
          </div>

          {loading ? (
            <div className="admin-placeholder">
              <Spinner size={22} label="Loading tasks…" />
            </div>
          ) : loadError ? (
            <div className="task-load-error" role="alert">
              <p>Couldn’t load your tasks. {loadError}</p>
              <button type="button" className="btn btn-secondary" onClick={refresh}>
                Try again
              </button>
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={
                statusFilter
                  ? 'No tasks match this status'
                  : scope === 'created'
                    ? 'You haven’t created any tasks'
                    : 'Nothing assigned to you'
              }
              description={
                statusFilter
                  ? 'Set the status filter to “Any status” to see more tasks.'
                  : scope === 'created'
                    ? 'Use “New task” to hand something to a colleague.'
                    : 'New tasks from your colleagues will show up here.'
              }
            />
          ) : (
            groups.map((g) => (
              <section key={g.key} className="task-group" aria-label={g.label}>
                <h2 className={`task-group-head${g.alert ? ' alert' : ''}`}>
                  {g.alert && <CircleAlert size={16} aria-hidden="true" />}
                  {g.label}
                  <span className="task-group-count">{g.tasks.length}</span>
                </h2>
                <ul className="task-list">{g.tasks.map(renderRow)}</ul>
              </section>
            ))
          )}
        </>
      )}

      {creating && (
        <CreateTaskDialog
          assignees={assignees}
          spaces={spaces}
          onCreated={handleCreated}
          onCancel={() => setCreating(false)}
        />
      )}
    </section>
  )
}

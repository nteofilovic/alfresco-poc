import { useEffect, useState } from 'react'
import { ClipboardList, MessageCircle, Paperclip, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  api,
  type NodeDto,
  type Space,
  type TaskAssignee,
  type TaskAttachment,
  type TaskDto,
  type TaskScope,
} from '../api'
import { apiErrorMessage, formatDay, isOverdue } from '../formatters'
import { spaceColor } from '../spaceColor'
import { CreateTaskDialog } from './CreateTaskDialog'
import { EmptyState } from './EmptyState'
import { Spinner } from './Spinner'
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
}

const SCOPES: { value: TaskScope; label: string }[] = [
  { value: 'assigned', label: 'Assigned to me' },
  { value: 'created', label: 'Created by me' },
]

function byNewest(a: TaskDto, b: TaskDto) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

/** Tasks page: scope tabs, list, detail and creation. */
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
}: Props) {
  const [scope, setScope] = useState<TaskScope>('assigned')
  const [tasks, setTasks] = useState<TaskDto[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<TaskDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [spaceFilter, setSpaceFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .listTasks(scope)
      .then((list) => {
        if (cancelled) return
        setTasks([...list].sort(byNewest))
        setLoadError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setTasks([])
        setLoadError(apiErrorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [scope, reloadKey])

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

  // Spaces that actually occur in the loaded tasks, for the filter.
  const taskSpaces = Array.from(
    new Map((tasks ?? []).filter((t) => t.siteId).map((t) => [t.siteId as string, t.siteTitle ?? (t.siteId as string)])),
  ).sort((a, b) => a[1].localeCompare(b[1]))
  const visibleTasks = tasks && spaceFilter ? tasks.filter((t) => t.siteId === spaceFilter) : tasks

  function changeScope(next: TaskScope) {
    if (next === scope) return
    setScope(next)
    setSpaceFilter('')
    setTasks(null)
    setLoadError(null)
  }

  function refresh() {
    setTasks(null)
    setLoadError(null)
    setReloadKey((k) => k + 1)
  }

  function handleUpdated(task: TaskDto) {
    setSelected(task)
    setTasks((list) => list && list.map((t) => (t.id === task.id ? task : t)))
  }

  function handleCreated(task: TaskDto) {
    setCreating(false)
    // A task created for someone else shows under "Created by me"; switch there so the new row is visible.
    if (scope === 'created' || task.assignee === username) {
      setTasks((list) => (list ? [task, ...list].sort(byNewest) : list))
    } else {
      changeScope('created')
    }
  }

  async function openAttachment(a: TaskAttachment) {
    try {
      onPreview(await api.getNode(a.id))
    } catch (e) {
      onError(`Couldn’t open ${a.name}. ${apiErrorMessage(e)}`)
    }
  }

  return (
    <section className="tasks" aria-labelledby="tasks-heading">
      <div className="tasks-head">
        <h1 id="tasks-heading">Tasks</h1>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setCreating(true)}>
          <Plus size={15} aria-hidden="true" />
          New task
        </button>
      </div>

      <div className="sheet tasks-sheet">
        {selected ? (
          <TaskDetail
            key={selected.id}
            task={selected}
            username={username}
            nameOf={nameOf}
            activeAttachmentId={activePreviewId}
            onBack={() => setSelected(null)}
            onUpdated={handleUpdated}
            onMessagesChanged={onActivityChanged}
            onOpenAttachment={openAttachment}
          />
        ) : (
          <>
            <div className="toolbar">
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
                  </button>
                ))}
              </div>
              {taskSpaces.length > 0 && (
                <label className="task-space-filter">
                  <span className="sr-only">Filter by space</span>
                  <select value={spaceFilter} onChange={(e) => setSpaceFilter(e.target.value)} aria-label="Filter by space">
                    <option value="">All spaces</option>
                    {taskSpaces.map(([id, title]) => (
                      <option key={id} value={id}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                className="btn btn-ghost toolbar-refresh"
                onClick={refresh}
                disabled={tasks === null}
              >
                <RefreshCw size={14} aria-hidden="true" />
                Refresh
              </button>
            </div>

            {tasks === null ? (
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
            ) : visibleTasks && visibleTasks.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={
                  spaceFilter
                    ? 'No tasks in this space'
                    : scope === 'assigned'
                      ? 'Nothing assigned to you'
                      : 'You haven’t created any tasks'
                }
                description={
                  scope === 'assigned'
                    ? 'New tasks from your colleagues will show up here.'
                    : 'Use “New task” to hand something to a colleague.'
                }
              />
            ) : (
              <ul className="task-list">
                {(visibleTasks ?? []).map((t) => {
                  const open = !t.resolved && t.status !== 'done'
                  const overdue = open && isOverdue(t.dueDate)
                  return (
                    <li key={t.id}>
                      <button type="button" className="task-row" onClick={() => setSelected(t)}>
                        <span className="task-row-title">
                          {t.title}
                          {t.siteTitle && t.siteId && (
                            <span className="task-space-chip" style={spaceColor(t.siteId)}>
                              {t.siteTitle}
                            </span>
                          )}
                        </span>
                        <TaskStatusChip status={t.status} />
                        <span className={`task-row-due${overdue ? ' task-overdue' : ''}`}>
                          {overdue && <TriangleAlert size={13} aria-hidden="true" />}
                          <span className="sr-only">Due </span>
                          {formatDay(t.dueDate)}
                          {overdue && <span className="sr-only"> (overdue)</span>}
                        </span>
                        <span className="task-row-person">
                          <span className="sr-only">{scope === 'assigned' ? 'From ' : 'To '}</span>
                          {nameOf(scope === 'assigned' ? t.creator : t.assignee)}
                        </span>
                        {t.unreadMessages > 0 && (
                          <span className="task-row-unread" title={`${t.unreadMessages} unread messages`}>
                            <MessageCircle size={13} aria-hidden="true" />
                            {t.unreadMessages}
                            <span className="sr-only"> unread messages</span>
                          </span>
                        )}
                        <span className="task-row-files" title={`${t.attachments.length} attachments`}>
                          <Paperclip size={13} aria-hidden="true" />
                          {t.attachments.length}
                          <span className="sr-only"> attachments</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

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

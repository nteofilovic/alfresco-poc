import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, Ellipsis, Send } from 'lucide-react'
import { api, type LiveEvent, type TaskAttachment, type TaskDto, type TaskMessage, type TaskStatus } from '../api'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  apiErrorMessage,
  dueNote,
  extensionBadge,
  formatDate,
  formatDay,
  isOverdue,
  kindFor,
} from '../formatters'
import { DialogShell } from './DialogShell'
import { AVATAR_TONES, Avatar } from './TaskAvatar'
import { TaskStatusChip } from './TaskStatusChip'

interface Props {
  task: TaskDto
  username: string
  nameOf: (username: string) => string
  activeAttachmentId: string | null
  onBack: () => void
  onUpdated: (task: TaskDto) => void
  /** The conversation was opened (and so marked read) or written to; lets the rail badge catch up. */
  onMessagesChanged: () => void
  onOpenAttachment: (attachment: TaskAttachment) => void
  /** The latest server push; a new message on this task is appended to the open conversation. */
  liveEvent: { seq: number; event: LiveEvent } | null
}

const DAY_MS = 86_400_000

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
}

/** How much of the time between creation and due date has passed. */
function timeBudget(createdAt: string, dueDate: string | null, now = new Date()) {
  if (!dueDate) return null
  const start = startOfDay(new Date(createdAt))
  const due = startOfDay(parseDay(dueDate))
  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime())) return null
  const total = Math.max(1, Math.round((due.getTime() - start.getTime()) / DAY_MS))
  const used = Math.max(0, Math.round((startOfDay(now).getTime() - start.getTime()) / DAY_MS))
  return { total, used: Math.min(used, total), percent: Math.min(100, Math.round((used / total) * 100)) }
}

function dayLabel(d: Date, now = new Date()): string {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

interface DayGroup {
  key: string
  label: string
  messages: TaskMessage[]
  authors: string[]
}

/** Messages grouped by calendar day; the groups and the messages inside them follow `newestFirst`. */
function groupByDay(messages: TaskMessage[], newestFirst: boolean): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  for (const m of messages) {
    const d = new Date(m.createdAt)
    const key = startOfDay(d).toISOString()
    let g = groups.get(key)
    if (!g) {
      g = { key, label: dayLabel(d), messages: [], authors: [] }
      groups.set(key, g)
    }
    g.messages.push(m)
    if (!g.authors.includes(m.author)) g.authors.push(m.author)
  }
  const list = [...groups.values()]
  if (newestFirst) {
    list.reverse()
    list.forEach((g) => g.messages.reverse())
  }
  return list
}

export function TaskDetail({ task, username, nameOf, activeAttachmentId, onBack, onUpdated, onMessagesChanged, onOpenAttachment, liveEvent }: Props) {
  const [messages, setMessages] = useState<TaskMessage[] | null>(null)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState<'resolve' | 'cancel' | null>(null)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newestFirst, setNewestFirst] = useState(true)
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isAssignee = task.assignee === username
  const canEdit = isAssignee && !task.resolved
  const overdue = !task.resolved && task.status !== 'done' && isOverdue(task.dueDate)
  const hasDraft = draft.trim().length > 0

  // Opening a task loads its conversation, which also marks it read on the server.
  useEffect(() => {
    let cancelled = false
    api
      .getTaskMessages(task.id)
      .then((list) => {
        if (cancelled) return
        setMessages(list)
        if (task.unreadMessages > 0) {
          onUpdated({ ...task, unreadMessages: 0 })
          onMessagesChanged()
        }
      })
      .catch((err) => !cancelled && setMessagesError(apiErrorMessage(err)))
    return () => {
      cancelled = true
    }
    // Only when a different task is opened; `task` itself changes with every status save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  // Reading the thread marks it read again, so the badge never counts a message that is already on screen.
  const handledSeq = useRef(liveEvent?.seq ?? 0)
  useEffect(() => {
    if (!liveEvent || liveEvent.seq === handledSeq.current) return
    handledSeq.current = liveEvent.seq
    if (liveEvent.event.taskId !== task.id) return
    api
      .getTaskMessages(task.id)
      .then((list) => {
        setMessages(list)
        onMessagesChanged()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvent])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  const groups = useMemo(() => groupByDay(messages ?? [], newestFirst), [messages, newestFirst])
  const latestId = messages && messages.length > 1 ? messages[messages.length - 1].id : null
  // People get distinct colours: creator and assignee first, then anyone else who wrote in the thread.
  const toneOf = useMemo(() => {
    const order = [task.creator, task.assignee, ...(messages ?? []).map((m) => m.author)]
    const people = [...new Set(order)]
    return (user: string) => Math.max(0, people.indexOf(user)) % AVATAR_TONES
  }, [task.creator, task.assignee, messages])
  const dueText = dueNote(task.dueDate)
  const budget = timeBudget(task.createdAt, task.dueDate)

  async function post(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!hasDraft || posting) return
    setPosting(true)
    setMessagesError(null)
    try {
      const sent = await api.postTaskMessage(task.id, draft)
      setMessages((list) => [...(list ?? []), sent])
      setDraft('')
      onMessagesChanged()
    } catch (err) {
      setMessagesError(apiErrorMessage(err))
    } finally {
      setPosting(false)
    }
  }

  async function changeStatus(next: TaskStatus) {
    setMenuOpen(false)
    if (next === task.status) return
    // Cancelling closes the task, so it goes through the same confirmation as Mark as done.
    if (next === 'cancelled') {
      setConfirming('cancel')
      return
    }
    setSaving(true)
    setError(null)
    try {
      onUpdated(await api.updateTask(task.id, { status: next }))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function resolve() {
    setResolving(true)
    setError(null)
    try {
      const cancelling = confirming === 'cancel'
      // A message typed but not sent yet goes out first, so it isn't lost when the thread closes.
      if (hasDraft) await api.postTaskMessage(task.id, draft)
      const updated = await api.resolveTask(task.id, cancelling ? reason : undefined, cancelling)
      setDraft('')
      setReason('')
      setConfirming(null)
      onUpdated(updated)
      onMessagesChanged()
      api.getTaskMessages(task.id).then(setMessages).catch(() => {})
    } catch (err) {
      setError(apiErrorMessage(err))
      setConfirming(null)
    } finally {
      setResolving(false)
    }
  }

  function toggleDay(key: string) {
    setOpenDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function renderMessage(m: TaskMessage) {
    const latest = m.id === latestId
    return (
      <li key={m.id} className={`task-msg${latest ? ' latest' : ''}${m.author === username ? ' mine' : ''}`}>
        <Avatar name={nameOf(m.author)} tone={toneOf(m.author)} />
        <div className="task-msg-body">
          {latest && <span className="task-msg-flag">Latest update</span>}
          <div className="task-msg-meta">
            <span className="task-msg-author">{m.author === username ? 'you' : nameOf(m.author)}</span>
            <time dateTime={m.createdAt}>{formatDate(m.createdAt)}</time>
          </div>
          <p className="task-text">{m.text}</p>
        </div>
      </li>
    )
  }

  return (
    <article className="task-detail" aria-labelledby="task-detail-title">
      <button type="button" className="btn btn-ghost task-back" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" />
        All tasks
      </button>

      <header className="task-detail-head">
        <h3 id="task-detail-title">{task.title}</h3>
        <TaskStatusChip status={task.status} />
        {canEdit && (
          <div className="task-head-actions">
            <div className="task-menu" ref={menuRef}>
              <button
                type="button"
                className="btn btn-secondary task-menu-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Change status"
                onClick={() => setMenuOpen((o) => !o)}
                disabled={saving}
              >
                <Ellipsis size={16} aria-hidden="true" />
              </button>
              {menuOpen && (
                <ul className="task-menu-list" role="menu">
                  {TASK_STATUSES.filter((s) => s !== 'done').map((s) => (
                    <li key={s} role="none">
                      <button type="button" role="menuitemradio" aria-checked={s === task.status} onClick={() => changeStatus(s)}>
                        {s === task.status ? <Check size={14} aria-hidden="true" /> : <span className="task-menu-gap" />}
                        {s === 'cancelled' ? 'Cancel task…' : TASK_STATUS_LABELS[s]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setConfirming('resolve')} disabled={saving}>
              <Check size={15} aria-hidden="true" />
              Mark as done
            </button>
          </div>
        )}
      </header>
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
      {!canEdit && (task.resolved || !isAssignee) && (
        <p className="task-readonly">
          {task.resolved
            ? task.status === 'cancelled'
              ? 'This task has been cancelled.'
              : 'This task has been resolved.'
            : `Only ${nameOf(task.assignee)} can change the status of this task.`}
        </p>
      )}

      <div className="task-cards">
        <section className="task-card" aria-labelledby="task-meta-h">
          <h4 id="task-meta-h">Details</h4>
          <dl className="task-meta">
            <div>
              <dt>Assigned to</dt>
              <dd>
                <Avatar name={nameOf(task.assignee)} tone={toneOf(task.assignee)} small />
                {task.assignee === username ? 'you' : nameOf(task.assignee)}
              </dd>
            </div>
            <div>
              <dt>Created by</dt>
              <dd>
                <Avatar name={nameOf(task.creator)} tone={toneOf(task.creator)} small />
                {task.creator === username ? 'you' : nameOf(task.creator)}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(task.createdAt)}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd className={overdue ? 'task-overdue' : undefined}>
                {formatDay(task.dueDate)}
                {dueText && !task.resolved && <span className="task-due-note"> · {dueText}</span>}
              </dd>
            </div>
          </dl>
        </section>

        <section className="task-card" aria-labelledby="task-desc-h">
          <h4 id="task-desc-h">Description</h4>
          {task.description.trim() ? <p className="task-text">{task.description}</p> : <p className="task-none">No description.</p>}
          {budget && (
            <div className="task-budget">
              <span>
                Time used · {budget.used} of {budget.total} {budget.total === 1 ? 'day' : 'days'}
              </span>
              <div
                className={`task-budget-bar${overdue ? ' over' : ''}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={budget.percent}
                aria-label="Time used"
              >
                <span style={{ width: `${budget.percent}%` }} />
              </div>
            </div>
          )}
        </section>

        <section className="task-card" aria-labelledby="task-att-h">
          <h4 id="task-att-h">Files · {task.attachments.length}</h4>
          {task.attachments.length === 0 ? (
            <p className="task-none">No documents attached.</p>
          ) : (
            <ul className="task-attach-list">
              {task.attachments.map((a) => (
                <li key={a.id} className={a.id === activeAttachmentId ? 'active' : undefined}>
                  {a.accessible === false ? (
                    <span className="task-attach-name task-attach-denied">
                      No access to this document{task.siteTitle ? ` (${task.siteTitle})` : ''}. Ask an administrator to add you to the space.
                    </span>
                  ) : (
                    <>
                      <span className={`task-file-badge kind-${kindFor(a.name, false)}`}>{extensionBadge(a.name).slice(0, 3) || 'FILE'}</span>
                      <button
                        type="button"
                        className="link task-attach-name"
                        onClick={() => onOpenAttachment(a)}
                        aria-pressed={a.id === activeAttachmentId}
                        title="Preview"
                      >
                        {a.name}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="task-convo" aria-labelledby="task-msg-h">
        <header className="task-convo-head">
          <h4 id="task-msg-h">Conversation</h4>
          <span className="task-convo-count">
            {messages?.length ?? 0} {messages?.length === 1 ? 'message' : 'messages'} · {newestFirst ? 'newest' : 'oldest'} first
          </span>
          <div className="task-order" role="group" aria-label="Message order">
            <button type="button" aria-pressed={newestFirst} onClick={() => setNewestFirst(true)}>
              Newest first
            </button>
            <button type="button" aria-pressed={!newestFirst} onClick={() => setNewestFirst(false)}>
              Oldest first
            </button>
          </div>
        </header>

        {!task.resolved && (
          <form className="task-compose" onSubmit={post}>
            <Avatar name={nameOf(username)} tone={toneOf(username)} />
            <label className="task-compose-field">
              <span className="sr-only">New message</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) post(e)
                }}
                rows={1}
                maxLength={2000}
                placeholder={`Reply to ${nameOf(isAssignee ? task.creator : task.assignee)}…`}
                disabled={posting}
              />
            </label>
            <button type="submit" className="btn btn-primary task-send" disabled={!hasDraft || posting} aria-label={posting ? 'Sending' : 'Send'}>
              <Send size={16} aria-hidden="true" />
            </button>
          </form>
        )}
        {messagesError && (
          <p className="dialog-error task-convo-pad" role="alert">
            {messagesError}
          </p>
        )}

        {messages === null && !messagesError ? (
          <p className="task-none task-convo-pad">Loading…</p>
        ) : messages && messages.length === 0 ? (
          <p className="task-none task-convo-pad">No messages yet.</p>
        ) : (
          <div className="task-days">
            {groups.map((g, i) => {
              // The day holding the newest message stays open; earlier days fold away.
              const current = newestFirst ? i === 0 : i === groups.length - 1
              if (current) {
                return (
                  <div key={g.key} className="task-day">
                    <p className="task-day-label">{g.label}</p>
                    <ul className="task-thread">{g.messages.map(renderMessage)}</ul>
                  </div>
                )
              }
              const open = openDays.has(g.key)
              return (
                <div key={g.key} className="task-day folded">
                  <button type="button" className="task-day-toggle" aria-expanded={open} onClick={() => toggleDay(g.key)}>
                    <ChevronDown size={16} aria-hidden="true" className={open ? 'open' : undefined} />
                    <strong>{g.label}</strong>
                    <span className="task-day-count">
                      {g.messages.length} {g.messages.length === 1 ? 'message' : 'messages'}
                    </span>
                    <span className="task-day-people">
                      {g.authors.map((a) => (
                        <Avatar key={a} name={nameOf(a)} tone={toneOf(a)} small />
                      ))}
                    </span>
                  </button>
                  {open && <ul className="task-thread">{g.messages.map(renderMessage)}</ul>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {confirming && (
        <DialogShell
          title={confirming === 'cancel' ? 'Cancel this task?' : 'Resolve this task?'}
          confirmLabel={confirming === 'cancel' ? 'Cancel task' : 'Resolve task'}
          busyLabel={confirming === 'cancel' ? 'Cancelling…' : 'Resolving…'}
          busy={resolving}
          confirmDisabled={confirming === 'cancel' && !reason.trim()}
          onConfirm={resolve}
          onCancel={() => {
            setConfirming(null)
            setReason('')
          }}
        >
          <p>
            “{task.title}” will be marked as {confirming === 'cancel' ? 'cancelled' : 'done'} and {nameOf(task.creator)} will be notified.
            {hasDraft && ' The message you are writing will be sent first.'} The conversation becomes read-only afterwards.
          </p>
          {confirming === 'cancel' && (
            <label className="dialog-field">
              Reason for cancelling (required)
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} disabled={resolving} autoFocus />
            </label>
          )}
        </DialogShell>
      )}
    </article>
  )
}

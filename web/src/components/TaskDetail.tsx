import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, Send, TriangleAlert } from 'lucide-react'
import { api, type TaskAttachment, type TaskDto, type TaskMessage, type TaskStatus } from '../api'
import { TASK_STATUSES, TASK_STATUS_LABELS, apiErrorMessage, formatDate, formatDay, isOverdue, kindFor } from '../formatters'
import { DialogShell } from './DialogShell'
import { FileIcon } from './FileIcon'
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
}

export function TaskDetail({ task, username, nameOf, activeAttachmentId, onBack, onUpdated, onMessagesChanged, onOpenAttachment }: Props) {
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [messages, setMessages] = useState<TaskMessage[] | null>(null)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState<'resolve' | 'cancel' | null>(null)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAssignee = task.assignee === username
  const canEdit = isAssignee && !task.resolved
  const overdue = !task.resolved && task.status !== 'done' && isOverdue(task.dueDate)
  const hasDraft = draft.trim().length > 0
  const dirty = status !== task.status

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

  async function post(e: FormEvent) {
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

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!dirty) return
    // Cancelling closes the task, so it goes through the same confirmation as Resolve.
    if (status === 'cancelled') {
      setConfirming('cancel')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateTask(task.id, { status })
      setStatus(updated.status)
      onUpdated(updated)
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

  return (
    <article className="task-detail" aria-labelledby="task-detail-title">
      <button type="button" className="btn btn-ghost task-back" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" />
        All tasks
      </button>

      <header className="task-detail-head">
        <h3 id="task-detail-title">{task.title}</h3>
        <TaskStatusChip status={task.status} />
      </header>

      <dl className="task-meta">
        <div>
          <dt>Created</dt>
          <dd>{formatDate(task.createdAt)}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd className={overdue ? 'task-overdue' : undefined}>
            {overdue && <TriangleAlert size={14} aria-hidden="true" />}
            {formatDay(task.dueDate)}
            {overdue && ' (overdue)'}
          </dd>
        </div>
        <div>
          <dt>Created by</dt>
          <dd>{nameOf(task.creator)}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{nameOf(task.assignee)}</dd>
        </div>
      </dl>

      <section className="task-section" aria-labelledby="task-desc-h">
        <h4 id="task-desc-h">Description</h4>
        {task.description.trim() ? <p className="task-text">{task.description}</p> : <p className="task-none">No description.</p>}
      </section>

      <section className="task-section" aria-labelledby="task-att-h">
        <h4 id="task-att-h">Attachments</h4>
        {task.attachments.length === 0 ? (
          <p className="task-none">No documents attached.</p>
        ) : (
          <ul className="task-attach-list">
            {task.attachments.map((a) => (
              <li key={a.id} className={a.id === activeAttachmentId ? 'active' : undefined}>
                <FileIcon kind={kindFor(a.name, false)} size={16} />
                {a.accessible === false ? (
                  <span className="task-attach-name task-attach-denied">
                    No access to this document{task.siteTitle ? ` (${task.siteTitle})` : ''}. Ask an administrator to add you to the space.
                  </span>
                ) : (
                <button
                  type="button"
                  className="link task-attach-name"
                  onClick={() => onOpenAttachment(a)}
                  aria-pressed={a.id === activeAttachmentId}
                  title="Preview"
                >
                  {a.name}
                </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="task-section" aria-labelledby="task-msg-h">
        <h4 id="task-msg-h">Conversation</h4>
        {messages === null && !messagesError ? (
          <p className="task-none">Loading…</p>
        ) : messages && messages.length === 0 ? (
          <p className="task-none">No messages yet.</p>
        ) : (
          <ul className="task-thread">
            {(messages ?? []).map((m) => (
              <li key={m.id} className={`task-msg${m.author === username ? ' mine' : ''}`}>
                <div className="task-msg-meta">
                  <span className="task-msg-author">{nameOf(m.author)}</span>
                  <time dateTime={m.createdAt}>{formatDate(m.createdAt)}</time>
                </div>
                <p className="task-text">{m.text}</p>
              </li>
            ))}
          </ul>
        )}

        {!task.resolved && (
          <form className="task-compose" onSubmit={post}>
            <label className="dialog-field">
              <span className="sr-only">New message</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={`Write to ${nameOf(isAssignee ? task.creator : task.assignee)}…`}
                disabled={posting}
              />
            </label>
            <div className="task-actions">
              <button type="submit" className="btn btn-primary" disabled={!hasDraft || posting}>
                <Send size={14} aria-hidden="true" />
                {posting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
        <p className="dialog-error" role="alert">
          {messagesError}
        </p>
      </section>

      {canEdit ? (
        <form className="task-edit" onSubmit={save}>
          <label className="dialog-field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} disabled={saving}>
              {/* "Done" is only reachable through Resolve, which also notifies the creator. */}
              {TASK_STATUSES.filter((s) => s !== 'done').map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <p className="dialog-error" role="alert">
            {error}
          </p>
          <div className="task-actions">
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming('resolve')} disabled={saving}>
              <CheckCircle2 size={15} aria-hidden="true" />
              Resolve
            </button>
          </div>
        </form>
      ) : (
        <p className="task-readonly">
          {task.resolved
            ? task.status === 'cancelled'
              ? 'This task has been cancelled.'
              : 'This task has been resolved.'
            : isAssignee
              ? ''
              : `Only ${nameOf(task.assignee)} can change the status of this task.`}
        </p>
      )}

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

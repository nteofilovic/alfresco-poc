import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, TriangleAlert } from 'lucide-react'
import { api, type TaskAttachment, type TaskDto, type TaskStatus } from '../api'
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
  onOpenAttachment: (attachment: TaskAttachment) => void
}

/** The assignee's message is one running text; new input is appended below what is already there. */
function composeMessage(existing: string, addition: string): string {
  const text = addition.trim()
  return existing.trim() ? `${existing.trimEnd()}\n\n${text}` : text
}

export function TaskDetail({ task, username, nameOf, activeAttachmentId, onBack, onUpdated, onOpenAttachment }: Props) {
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [addition, setAddition] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEdit = task.assignee === username && !task.resolved
  const overdue = !task.resolved && task.status !== 'done' && isOverdue(task.dueDate)
  const hasAddition = addition.trim().length > 0
  const dirty = status !== task.status || hasAddition

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!dirty) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateTask(task.id, {
        ...(status !== task.status ? { status } : {}),
        ...(hasAddition ? { message: composeMessage(task.message, addition) } : {}),
      })
      setAddition('')
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
      const updated = await api.resolveTask(task.id, hasAddition ? composeMessage(task.message, addition) : undefined)
      setAddition('')
      setConfirming(false)
      onUpdated(updated)
    } catch (err) {
      setError(apiErrorMessage(err))
      setConfirming(false)
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
                <button
                  type="button"
                  className="link task-attach-name"
                  onClick={() => onOpenAttachment(a)}
                  aria-pressed={a.id === activeAttachmentId}
                  title="Preview"
                >
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="task-section" aria-labelledby="task-msg-h">
        <h4 id="task-msg-h">Message from {nameOf(task.assignee)}</h4>
        {task.message.trim() ? <p className="task-text task-message">{task.message}</p> : <p className="task-none">No message yet.</p>}
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
          <label className="dialog-field">
            Add to message
            <textarea
              value={addition}
              onChange={(e) => setAddition(e.target.value)}
              rows={3}
              placeholder="Tell the creator how it's going…"
              disabled={saving}
            />
          </label>
          <p className="dialog-error" role="alert">
            {error}
          </p>
          <div className="task-actions">
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)} disabled={saving}>
              <CheckCircle2 size={15} aria-hidden="true" />
              Resolve
            </button>
          </div>
        </form>
      ) : (
        <p className="task-readonly">
          {task.resolved
            ? 'This task has been resolved.'
            : task.assignee === username
              ? ''
              : `Only ${nameOf(task.assignee)} can update this task.`}
        </p>
      )}

      {confirming && (
        <DialogShell
          title="Resolve this task?"
          confirmLabel="Resolve task"
          busyLabel="Resolving…"
          busy={resolving}
          onConfirm={resolve}
          onCancel={() => setConfirming(false)}
        >
          <p>
            “{task.title}” will be marked as done and {nameOf(task.creator)} will be notified.
            {hasAddition && ' Your message will be included.'} You won’t be able to edit it afterwards.
          </p>
        </DialogShell>
      )}
    </article>
  )
}

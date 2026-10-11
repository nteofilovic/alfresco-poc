import { useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { api, type TaskAssignee, type TaskAttachment, type TaskDto } from '../api'
import { apiErrorMessage, kindFor, todayInputValue } from '../formatters'
import { DialogShell } from './DialogShell'
import { FileIcon } from './FileIcon'
import { AttachmentPickerDialog } from './AttachmentPickerDialog'

interface Props {
  assignees: TaskAssignee[]
  /** Where the attachment picker starts; null when no workspace exists yet (attaching is then unavailable). */
  pickerRoot: { id: string; name: string } | null
  onCreated: (task: TaskDto) => void
  onCancel: () => void
}

export function CreateTaskDialog({ assignees, pickerRoot, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const task = await api.createTask({
        title: title.trim(),
        description: description.trim(),
        dueDate,
        assignee,
        attachmentIds: attachments.map((a) => a.id),
      })
      onCreated(task)
    } catch (e) {
      setError(apiErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <>
      <DialogShell
        title="New task"
        confirmLabel="Create task"
        busyLabel="Creating…"
        busy={busy}
        confirmDisabled={!title.trim() || !dueDate || !assignee}
        wide
        onConfirm={create}
        onCancel={onCancel}
      >
        <label className="dialog-field">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
        </label>
        <label className="dialog-field">
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </label>
        <div className="task-field-row">
          <label className="dialog-field">
            Due date
            <input type="date" value={dueDate} min={todayInputValue()} onChange={(e) => setDueDate(e.target.value)} required />
          </label>
          <label className="dialog-field">
            Assignee
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} required>
              <option value="" disabled>
                Choose a person…
              </option>
              {assignees.map((a) => (
                <option key={a.username} value={a.username}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dialog-field">
          <span id="task-attach-label">Documents</span>
          {attachments.length > 0 && (
            <ul className="task-attach-list" aria-labelledby="task-attach-label">
              {attachments.map((a) => (
                <li key={a.id}>
                  <FileIcon kind={kindFor(a.name, false)} size={16} />
                  <span className="task-attach-name">{a.name}</span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                    aria-label={`Remove ${a.name}`}
                    title="Remove"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPicking(true)}
              disabled={!pickerRoot || busy}
              title={pickerRoot ? undefined : 'The workspace isn’t set up yet'}
            >
              <Paperclip size={15} aria-hidden="true" />
              {attachments.length > 0 ? 'Change documents…' : 'Attach documents…'}
            </button>
          </div>
        </div>

        <p className="dialog-error" role="alert">
          {error}
        </p>
      </DialogShell>

      {picking && pickerRoot && (
        <AttachmentPickerDialog
          root={pickerRoot}
          initial={attachments}
          onConfirm={(files) => {
            setAttachments(files)
            setPicking(false)
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </>
  )
}

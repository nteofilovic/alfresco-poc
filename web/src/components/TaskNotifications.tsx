import { CircleCheck, X } from 'lucide-react'
import type { TaskNotification } from '../api'
import { formatDate } from '../formatters'

interface Props {
  notifications: TaskNotification[]
  nameOf: (username: string) => string
  onOpen: (taskId: string) => void
  onDismiss: (id: string) => void
}

/** List items for creators: tasks they handed out that the assignee has since resolved. Rendered inside the activity panel's list. */
export function TaskNotifications({ notifications, nameOf, onOpen, onDismiss }: Props) {
  return (
    <>
      {notifications.map((n) => (
        <li key={n.id}>
          <CircleCheck size={16} className="activity-icon" aria-hidden="true" />
          <p>
            <span className="activity-kind">Task completed</span>
            <span className="activity-text">
              {' '}
              <strong>{nameOf(n.assignee)}</strong> completed “{n.title}”
              <span className="task-notice-time"> · {formatDate(n.resolvedAt)}</span>
            </span>
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => onOpen(n.taskId)}>
            Open<span className="sr-only"> {n.title}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onDismiss(n.id)}
            aria-label={`Dismiss notification for ${n.title}`}
            title="Dismiss"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </>
  )
}

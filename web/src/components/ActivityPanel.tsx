import { ClipboardList, TriangleAlert, X } from 'lucide-react'
import { isOverdue, formatDay } from '../formatters'
import type { TaskActivity } from '../hooks/useTaskActivity'
import { TaskNotifications } from './TaskNotifications'

interface Props {
  activity: TaskActivity
  /** Opens the Tasks page, optionally on a specific task. */
  onOpenTasks: (taskId?: string) => void
  onError: (message: string) => void
}

/** Task notices (new assignments, completed hand-offs) with open/dismiss. Best effort: a failed fetch never blocks the page. */
export function ActivityList({ activity, onOpenTasks, onError }: Props) {
  const { loaded, failed, newAssignments, completions } = activity
  const hasNotices = newAssignments.length + completions.length > 0

  async function dismissCompletion(id: string) {
    const message = await activity.dismissCompletion(id)
    if (message) onError(message)
  }

  if (!hasNotices) {
    return !loaded && !failed ? (
      <p className="activity-empty">Checking for new activity…</p>
    ) : failed && !loaded ? (
      <p className="activity-empty">
        Couldn’t load activity.{' '}
        <button type="button" className="link" onClick={activity.refresh}>
          Try again
        </button>
      </p>
    ) : (
      <p className="activity-empty">You’re all caught up.</p>
    )
  }

  return (
    <ul className="activity-list">
      {newAssignments.map((t) => {
        const overdue = isOverdue(t.dueDate)
        return (
          <li key={t.id}>
            <ClipboardList size={16} className="activity-icon" aria-hidden="true" />
            <p>
              <span className="activity-kind">Task assigned to you</span>
              <span className="activity-text">
                <strong>{activity.displayNameOf(t.creator)}</strong> assigned you “{t.title}”
                {t.dueDate && (
                  <span className={`task-notice-time${overdue ? ' task-overdue' : ''}`}>
                    {' · '}
                    {overdue && <TriangleAlert size={13} aria-hidden="true" />}
                    Due {formatDay(t.dueDate)}
                    {overdue && ' (overdue)'}
                  </span>
                )}
              </span>
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenTasks(t.id)}>
              Open<span className="sr-only"> {t.title}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => activity.dismissAssignment(t.id)}
              aria-label={`Dismiss notice for ${t.title}`}
              title="Dismiss"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        )
      })}
      <TaskNotifications
        notifications={completions}
        nameOf={activity.displayNameOf}
        onOpen={(id) => onOpenTasks(id)}
        onDismiss={dismissCompletion}
      />
    </ul>
  )
}

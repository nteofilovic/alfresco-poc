import { ClipboardList, TriangleAlert, X } from 'lucide-react'
import { isOverdue, formatDay } from '../formatters'
import type { TaskActivity } from '../hooks/useTaskActivity'
import { TaskNotifications } from './TaskNotifications'

interface Props {
  username: string
  firstName: string
  activity: TaskActivity
  /** Opens the Tasks page, optionally on a specific task. */
  onOpenTasks: (taskId?: string) => void
  onError: (message: string) => void
}

/** Compact "what's new" panel on the Workspace landing page. Best effort: a failed fetch never blocks the page. */
export function ActivityPanel({ username, firstName, activity, onOpenTasks, onError }: Props) {
  const { loaded, failed, newAssignments, completions, openCount, overdueCount } = activity
  const hasNotices = newAssignments.length + completions.length > 0

  async function dismissCompletion(id: string) {
    const message = await activity.dismissCompletion(id)
    if (message) onError(message)
  }

  return (
    <section className="activity" aria-labelledby="activity-heading">
      <p className="tasks-hello">Hello, {firstName || username}</p>
      <div className="activity-head">
        <h2 id="activity-heading">Activity</h2>
        {loaded && (
          <button type="button" className="link activity-summary" onClick={() => onOpenTasks()}>
            <ClipboardList size={14} aria-hidden="true" />
            {openCount} open {openCount === 1 ? 'task' : 'tasks'} · {overdueCount} overdue
          </button>
        )}
      </div>

      {hasNotices ? (
        <ul className="activity-list">
          {newAssignments.map((t) => {
            const overdue = isOverdue(t.dueDate)
            return (
              <li key={t.id}>
                <ClipboardList size={16} className="activity-icon" aria-hidden="true" />
                <p>
                  <span className="activity-kind">Task assigned to you</span>
                  <span className="activity-text">
                    {' '}
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
                <button type="button" className="btn btn-ghost" onClick={() => onOpenTasks(t.id)}>
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
      ) : !loaded && !failed ? (
        <p className="activity-empty">Checking for new activity…</p>
      ) : failed && !loaded ? (
        <p className="activity-empty">
          Couldn’t load activity.{' '}
          <button type="button" className="link" onClick={activity.refresh}>
            Try again
          </button>
        </p>
      ) : (
        <p className="activity-empty">No new activity</p>
      )}
    </section>
  )
}

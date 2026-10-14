import { formatDate, greeting, initials } from '../formatters'
import type { TaskActivity } from '../hooks/useTaskActivity'
import type { RecentDocument } from '../hooks/useRecentDocuments'
import { FileTile } from './FileIcon'

interface Props {
  name: string
  activity: TaskActivity
  recent: RecentDocument[]
  /** Opens the Tasks page, optionally on a specific task. */
  onOpenTasks: (taskId?: string) => void
  onOpenRecent: (doc: RecentDocument) => void
}

interface ActivityItem {
  key: string
  who: string
  text: string
  at: string
  taskId: string
}

/** Workspace landing: greeting plus My tasks / Latest activity / Recently opened cards. */
export function WorkspaceOverview({ name, activity, recent, onOpenTasks, onOpenRecent }: Props) {
  const { loaded, failed, openCount, overdueCount, nextTask } = activity

  const items: ActivityItem[] = [
    ...activity.completions.map((n) => ({
      key: `c-${n.id}`,
      who: activity.displayNameOf(n.assignee),
      text: `completed “${n.title}”`,
      at: n.resolvedAt,
      taskId: n.taskId,
    })),
    ...activity.newAssignments.map((t) => ({
      key: `a-${t.id}`,
      who: activity.displayNameOf(t.creator),
      text: `assigned you “${t.title}”`,
      at: t.createdAt,
      taskId: t.id,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3)

  return (
    <section className="overview" aria-labelledby="overview-heading">
      <div className="overview-head">
        <p className="overview-greeting">
          {greeting()}, {name}
        </p>
        <h1 id="overview-heading">Here is what needs you today</h1>
      </div>

      <div className="overview-cards">
        <article className="card" aria-labelledby="card-tasks">
          <div className="card-head">
            <h2 id="card-tasks">My tasks</h2>
            <button type="button" className="link link-accent" onClick={() => onOpenTasks()}>
              View all
            </button>
          </div>
          {loaded ? (
            <>
              <p className="card-stat">
                <span className="card-stat-value">{openCount}</span>
                <span className="card-stat-label">open</span>
                <span className={`pill ${overdueCount > 0 ? 'pill-danger' : 'pill-ok'}`}>{overdueCount} overdue</span>
              </p>
              {nextTask ? (
                <p className="card-note">
                  Next:{' '}
                  <button type="button" className="link" onClick={() => onOpenTasks(nextTask.id)}>
                    “{nextTask.title}”
                  </button>
                </p>
              ) : (
                <p className="card-note">Nothing waiting on you.</p>
              )}
            </>
          ) : (
            <p className="card-note">{failed ? 'Couldn’t load your tasks.' : 'Loading…'}</p>
          )}
        </article>

        <article className="card" aria-labelledby="card-activity">
          <div className="card-head">
            <h2 id="card-activity">Latest activity</h2>
            <button type="button" className="link link-accent" onClick={() => onOpenTasks()}>
              Tasks
            </button>
          </div>
          {items.length > 0 ? (
            <ul className="card-list">
              {items.map((it) => (
                <li key={it.key} className="activity-item">
                  <span className="avatar avatar-soft avatar-sm" aria-hidden="true">
                    {initials(it.who)}
                  </span>
                  <span className="activity-item-text">
                    <button type="button" className="link" onClick={() => onOpenTasks(it.taskId)}>
                      <strong>{it.who}</strong> {it.text}
                    </button>
                    <span className="card-note">{formatDate(it.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-note">
              {failed && !loaded ? (
                <>
                  Couldn’t load activity.{' '}
                  <button type="button" className="link link-accent" onClick={activity.refresh}>
                    Try again
                  </button>
                </>
              ) : loaded ? (
                'No new activity.'
              ) : (
                'Checking for new activity…'
              )}
            </p>
          )}
        </article>

        <article className="card" aria-labelledby="card-recent">
          <div className="card-head">
            <h2 id="card-recent">Recently opened</h2>
          </div>
          {recent.length > 0 ? (
            <ul className="card-list">
              {recent.slice(0, 3).map((d) => (
                <li key={d.id}>
                  <button type="button" className="recent-item" onClick={() => onOpenRecent(d)}>
                    <FileTile name={d.name} isFolder={false} size="sm" />
                    <span className="recent-item-name">{d.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-note">Documents you open will show up here.</p>
          )}
        </article>
      </div>
    </section>
  )
}

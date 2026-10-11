import type { TaskStatus } from '../api'
import { TASK_STATUS_LABELS } from '../formatters'

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  return <span className={`task-chip task-chip-${status}`}>{TASK_STATUS_LABELS[status]}</span>
}

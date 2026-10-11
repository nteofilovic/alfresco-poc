import type { NodeDto, TaskStatus } from './api'

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  on_hold: 'On hold',
  done: 'Done',
}

export const TASK_STATUSES = Object.keys(TASK_STATUS_LABELS) as TaskStatus[]

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

/** Parses a date-only string ("2026-10-15") as a local calendar day, anything else as a timestamp. */
function parseDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
}

/** Calendar date without a time, e.g. for due dates. */
export function formatDay(value: string | null): string {
  if (!value) return '—'
  const d = parseDay(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** True when the due day is before today (an open task due today is not yet overdue). */
export function isOverdue(dueDate: string | null, now = new Date()): boolean {
  if (!dueDate) return false
  const due = parseDay(dueDate)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return due.getTime() < today.getTime()
}

/** Today as yyyy-MM-dd in local time, for <input type="date" min>. */
export function todayInputValue(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export type FileKind = 'pdf' | 'word' | 'excel' | 'image' | 'folder' | 'file'

const KINDS: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  tif: 'image',
  tiff: 'image',
}

export function kindFor(name: string, isFolder: boolean): FileKind {
  if (isFolder) return 'folder'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return KINDS[ext] ?? 'file'
}

/** handle() in api.ts formats errors as "<status> <statusText>: <json body>" - surface the API's message if present. */
export function apiErrorMessage(e: unknown): string {
  const text = String(e)
  const start = text.indexOf('{')
  if (start >= 0) {
    try {
      const message = JSON.parse(text.slice(start)).message
      if (typeof message === 'string') return message
    } catch {
      // not JSON; fall through
    }
  }
  return text
}

/** Folders the admin created as part of the workspace structure (marked via cm:description); they can't be renamed. */
export function isStructureFolder(node: NodeDto): boolean {
  return node.isFolder && node.properties?.['cm:description'] === 'zapis-structure'
}

/** Returns an error message for an invalid file/folder name, or null if it's acceptable. */
export function validateName(name: string): string | null {
  if (!name.trim()) return 'Enter a name.'
  if (/[\\/*?:"<>|]/.test(name)) return 'A name can’t contain \\ / * ? : " < > |'
  return null
}

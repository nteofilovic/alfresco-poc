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

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Swiss calendar date, dd.MM.yyyy. */
function swissDay(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** Timestamp in Swiss format (dd.MM.yyyy HH:mm), with "Today, 09:12" / "Yesterday, 22:17" for recent ones. */
export function formatDate(iso: string | null, now = new Date()): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return `${swissDay(d)} ${time}`
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
  return Number.isNaN(d.getTime()) ? '—' : swissDay(d)
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
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** "Good morning/afternoon/evening" for the Workspace greeting. */
export function greeting(now = new Date()): string {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Two-letter avatar initials: "Nenad Teofilovic" -> "NT", "admin" -> "AD". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
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

/** Short type badge text, e.g. "PDF", "XLSX"; empty for folders and extensionless files. */
export function extensionBadge(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toUpperCase().slice(0, 4)
}

const TYPE_LABELS: Record<FileKind, string> = {
  folder: 'Folder',
  pdf: 'PDF document',
  word: 'Word document',
  excel: 'Excel spreadsheet',
  image: 'Image',
  file: 'File',
}

/** Human-readable type, e.g. "Excel spreadsheet" or "TIFF image". */
export function typeLabel(name: string, isFolder: boolean): string {
  const kind = kindFor(name, isFolder)
  const ext = extensionBadge(name)
  if (kind === 'image' && ext) return `${ext === 'JPG' ? 'JPEG' : ext} image`
  if (kind === 'file' && ext) return `${ext} file`
  return TYPE_LABELS[kind]
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

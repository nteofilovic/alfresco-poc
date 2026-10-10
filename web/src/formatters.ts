import type { NodeDto } from './api'

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

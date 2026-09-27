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

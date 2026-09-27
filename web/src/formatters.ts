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

const ICONS: Record<string, string> = {
  pdf: '📕',
  doc: '📘',
  docx: '📘',
  xls: '📗',
  xlsx: '📗',
  jpg: '🖼️',
  jpeg: '🖼️',
  png: '🖼️',
  tif: '🖼️',
  tiff: '🖼️',
}

export function iconFor(name: string, isFolder: boolean): string {
  if (isFolder) return '📁'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ICONS[ext] ?? '📄'
}

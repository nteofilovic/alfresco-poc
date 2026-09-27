import { File, FileImage, FileSpreadsheet, FileText, Folder } from 'lucide-react'
import type { FileKind } from '../formatters'

interface Props {
  kind: FileKind
  size?: number
}

const CLASS_BY_KIND: Record<FileKind, string> = {
  folder: 'file-icon-folder',
  pdf: 'file-icon-pdf',
  word: 'file-icon-word',
  excel: 'file-icon-excel',
  image: 'file-icon-image',
  file: 'file-icon-generic',
}

export function FileIcon({ kind, size = 18 }: Props) {
  const className = `file-icon ${CLASS_BY_KIND[kind]}`
  switch (kind) {
    case 'folder':
      return <Folder size={size} className={className} aria-hidden="true" />
    case 'pdf':
      return <FileText size={size} className={className} aria-hidden="true" />
    case 'word':
      return <FileText size={size} className={className} aria-hidden="true" />
    case 'excel':
      return <FileSpreadsheet size={size} className={className} aria-hidden="true" />
    case 'image':
      return <FileImage size={size} className={className} aria-hidden="true" />
    default:
      return <File size={size} className={className} aria-hidden="true" />
  }
}

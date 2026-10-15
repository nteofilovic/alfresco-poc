import { File, FileImage, FileSpreadsheet, FileText, Folder, Shapes } from 'lucide-react'
import { extensionBadge, kindFor, type FileKind } from '../formatters'

interface TileProps {
  name: string
  isFolder: boolean
  /** 'md' is the 36px list tile, 'sm' the compact badge used in cards. */
  size?: 'sm' | 'md'
  /** A folder made from a folder template (Client, Property...): shown in the space's tone instead of amber. */
  templateInstance?: boolean
}

/** Rounded type tile: an amber folder, or the file extension on a colour keyed to its kind. */
export function FileTile({ name, isFolder, size = 'md', templateInstance = false }: TileProps) {
  const kind = templateInstance ? 'template' : kindFor(name, isFolder)
  return (
    <span className={`file-tile file-tile-${size} file-tile-${kind}`} aria-hidden="true">
      {templateInstance ? <Shapes size={size === 'md' ? 18 : 14} strokeWidth={2} /> : isFolder ? <Folder size={size === 'md' ? 18 : 14} fill="currentColor" strokeWidth={0} /> : extensionBadge(name) || 'FILE'}
    </span>
  )
}

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

import { Copy, Download, Eye, FileDown, FolderInput, Pencil, Share2, Trash2 } from 'lucide-react'
import { api, type NodeDto } from './api'
import type { MenuAction } from './components/ActionsMenu'
import { downloadNodes, downloadUrl } from './download'
import { isMemberFolder, isStructureFolder } from './formatters'

/** The link that opens a document in its folder (handled on startup in App). */
export function shareUrl(nodeId: string): string {
  return `${window.location.origin}/?node=${encodeURIComponent(nodeId)}`
}

export interface RowActionHandlers {
  isSearchView: boolean
  /** Admins may rename/copy/move folders; everyone may do so for files. */
  canManageFolders: boolean
  canDeleteFolders: boolean
  /** Set once the PDF's annotations were looked up; falls back to what the listing said. */
  hasAnnotations?: boolean
  onPreview: (node: NodeDto) => void
  /** Copies the link that opens the document in its folder. */
  onShare: (node: NodeDto) => void
  onRename: (node: NodeDto) => void
  onCopy: (node: NodeDto) => void
  onMove: (node: NodeDto) => void
  onDelete: (node: NodeDto) => void
}

/** The actions for one document or folder: the row's 3-dots menu and, for a single selected row, the side panel. */
export function rowActions(node: NodeDto, h: RowActionHandlers): MenuAction[] {
  const actions: MenuAction[] = []
  if (node.isFile) {
    actions.push(
      { key: 'details', label: 'Details', icon: <Eye size={15} aria-hidden="true" />, onSelect: () => h.onPreview(node) },
      { key: 'download', label: 'Download', icon: <Download size={15} aria-hidden="true" />, onSelect: () => downloadNodes([node.id]) },
    )
    actions.push({ key: 'share', label: 'Share', icon: <Share2 size={15} aria-hidden="true" />, onSelect: () => h.onShare(node) })
    // Only offered once the menu has found that this PDF has annotations (see FileTable.lookUpAnnotations).
    if (h.hasAnnotations ?? node.hasAnnotations) {
      actions.push({
        key: 'download-annotated',
        label: 'Download with annotations',
        icon: <FileDown size={15} aria-hidden="true" />,
        onSelect: () => downloadUrl(api.annotatedDownloadUrl(node.id)),
      })
    }
  }
  if (node.isFile || h.canManageFolders || isMemberFolder(node)) {
    const structure = isStructureFolder(node)
    actions.push({
      key: 'rename',
      label: 'Rename',
      icon: <Pencil size={15} aria-hidden="true" />,
      disabled: structure,
      hint: 'Part of the workspace structure',
      onSelect: () => h.onRename(node),
    })
    // Copy/Move pick a destination relative to the browsed folder, so they're unavailable in search results.
    actions.push(
      {
        key: 'copy',
        label: 'Copy to…',
        icon: <Copy size={15} aria-hidden="true" />,
        disabled: h.isSearchView,
        hint: 'Open the containing folder to copy',
        onSelect: () => h.onCopy(node),
      },
      {
        key: 'move',
        label: 'Move to…',
        icon: <FolderInput size={15} aria-hidden="true" />,
        disabled: h.isSearchView,
        hint: 'Open the containing folder to move',
        onSelect: () => h.onMove(node),
      },
    )
  }
  if (node.isFile || h.canDeleteFolders || isMemberFolder(node)) {
    actions.push({
      key: 'delete',
      label: 'Delete',
      icon: <Trash2 size={15} aria-hidden="true" />,
      danger: true,
      onSelect: () => h.onDelete(node),
    })
  }
  return actions
}

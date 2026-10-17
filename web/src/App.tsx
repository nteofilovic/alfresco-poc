import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, FormEvent } from 'react'
import { api, type Appearance, type AppStyle, type AuthUser, type FolderTemplate, type NodeDto, type NodeSortDir, type NodeSortKey, type Space } from './api'
import { LoginForm } from './LoginForm'
import { Sidebar, type View } from './components/Sidebar'
import { SpacesColumn } from './components/SpacesColumn'
import { Topbar } from './components/Topbar'
import { TopHeader } from './components/TopHeader'
import { CommandBar } from './components/CommandBar'
import { FolderTree } from './components/FolderTree'
import { SelectionPanel, SpaceInfoPanel } from './components/SelectionPanel'
import { SpaceMembers } from './components/SpaceMembers'
import { Trail, type TrailItem } from './components/Trail'
import type { SelectionActions } from './selectionActions'
import { roleLabel } from './spaceRoles'
import { CommandPalette, type Command } from './components/CommandPalette'
import { APP_STYLES, cacheAppStyle, cachedAppStyle } from './appStyles'
import { Breadcrumbs } from './components/Breadcrumbs'
import { Toolbar } from './components/Toolbar'
import { FileTable } from './components/FileTable'
import { Pager } from './components/Pager'
import { PAGE_SIZES } from './paging'
import { DetailsPanel } from './components/DetailsPanel'
import { AdministrationPage } from './components/AdministrationPage'
import { ProfilePage } from './components/ProfilePage'
import { TasksPage } from './components/TasksPage'
import { ActivityList } from './components/ActivityPanel'
import { HomePage } from './components/HomePage'
import { SpacesPage } from './components/SpacesPage'
import { NewFolderDialog } from './components/NewFolderDialog'
import { NewFromTemplateDialog } from './components/NewFromTemplateDialog'
import { spaceColor } from './spaceColor'
import { useTaskActivity } from './hooks/useTaskActivity'
import { useRecentDocuments, type RecentDocument } from './hooks/useRecentDocuments'
import { PreviewPane, RATIO_MAX, RATIO_MIN } from './components/PreviewPane'
import { ConfirmDialog } from './components/ConfirmDialog'
import { MergeDialog } from './components/MergeDialog'
import { RenameDialog } from './components/RenameDialog'
import { FolderPickerDialog } from './components/FolderPickerDialog'
import { ErrorToast } from './components/ErrorToast'
import { Spinner } from './components/Spinner'
import { downloadNodes } from './download'
import { apiErrorMessage } from './formatters'
import { ComparePreview } from './components/ComparePreview'
import {
  FileText,
  FolderClosed,
  FolderPlus,
  House,
  LayoutPanelLeft,
  LogOut,
  PanelTop,
  Settings,
  Shapes,
  SquareCheckBig,
  Upload,
  UserRound,
} from 'lucide-react'
import './App.css'

interface Crumb {
  id: string
  name: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const VIEW_LABEL: Record<View, string> = {
  home: 'Home',
  spaces: 'Spaces',
  tasks: 'Tasks',
  admin: 'Administration',
  profile: 'Profile',
}

const PREVIEW_RATIO_KEY = 'zapis.previewRatio'
const PAGE_SIZE_KEY = 'zapis.pageSize'
const DEFAULT_PAGE_SIZE = 20

function savedPageSize(): number {
  try {
    const saved = Number(localStorage.getItem(PAGE_SIZE_KEY))
    return (PAGE_SIZES as readonly number[]).includes(saved) ? saved : DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [path, setPath] = useState<Crumb[]>([]) // folders below the current space's document library
  const [spaces, setSpaces] = useState<Space[] | null>(null)
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null)
  const [templates, setTemplates] = useState<FolderTemplate[]>([])
  const [templateToCreate, setTemplateToCreate] = useState<FolderTemplate | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [nodes, setNodes] = useState<NodeDto[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Server-side paging of the browsed folder (page is zero-based).
  const [pageSize, setPageSize] = useState(savedPageSize)
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<NodeSortKey>('name')
  const [sortDir, setSortDir] = useState<NodeSortDir>('asc')
  const [totalItems, setTotalItems] = useState(0)
  const [pagedFolderId, setPagedFolderId] = useState('')
  // Latest paging inputs for loadFolder (refresh, upload, delete... reload whatever page is showing) and a
  // counter so only the newest request may update the list.
  const pagingRef = useRef({ page: 0, pageSize: DEFAULT_PAGE_SIZE, sortKey: 'name' as NodeSortKey, sortDir: 'asc' as NodeSortDir })
  const loadSeq = useRef(0)
  // Row of the freshly merged PDF, marked for ~2s.
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(highlightTimer.current), [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NodeDto[] | null>(null)
  const [bulkDialog, setBulkDialog] = useState<'merge' | 'copy' | 'move' | 'delete' | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  // The selected file belongs to the listing it was opened from; it closes when view, folder or search results change.
  // It shows in the details panel, and in the full preview pane once opened from there.
  const [preview, setPreview] = useState<{
    id: string
    view: View
    folderId: string
    searchResults: NodeDto[] | null
  } | null>(null)
  const [previewFull, setPreviewFull] = useState(false)
  // A document opened from a task or the "Recently opened" card; it takes over the preview pane until closed
  // or the user leaves the view it was opened from.
  const [docPreview, setDocPreview] = useState<{ node: NodeDto; view: View } | null>(null)
  const [previewFiles, setPreviewFiles] = useState<NodeDto[]>([])
  const [previewRatio, setPreviewRatio] = useState(() => {
    const saved = Number(localStorage.getItem(PREVIEW_RATIO_KEY))
    return saved >= RATIO_MIN && saved <= RATIO_MAX ? saved : 0.65
  })
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const changePreviewRatio = useCallback((r: number) => {
    setPreviewRatio(r)
    localStorage.setItem(PREVIEW_RATIO_KEY, String(r))
  }, [])
  const [rowDialog, setRowDialog] = useState<{ kind: 'rename' | 'copy' | 'move'; node: NodeDto } | null>(null)
  const [nodeToDelete, setNodeToDelete] = useState<NodeDto | null>(null)
  const [view, setView] = useState<View>('home')
  // Layout of the whole app; until /api/appearance answers, the one last rendered in this browser.
  const [appearance, setAppearance] = useState<Appearance | null>(null)
  const [fallbackStyle, setFallbackStyle] = useState<AppStyle>(cachedAppStyle)
  const appStyle = appearance?.style ?? fallbackStyle
  // Colours and fonts follow the style; on <html> so dialogs and menus outside the shell get them too.
  useEffect(() => {
    document.documentElement.dataset.style = appStyle
  }, [appStyle])
  // Command-bar layout: Documents or Members of the open space.
  const [spaceTab, setSpaceTab] = useState<'documents' | 'members'>('documents')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  // A task id to open when the Tasks page mounts (deep link from an activity notice).
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const clearPendingTask = useCallback(() => setPendingTaskId(null), [])
  const taskActivity = useTaskActivity(username)
  const refreshTaskActivity = taskActivity.refresh
  const resetTaskActivity = taskActivity.reset
  const recentDocs = useRecentDocuments(username)
  const addRecentDoc = recentDocs.add

  // Inside a space the trail starts at that space's document library.
  const root: Crumb | null = currentSpace ? { id: currentSpace.rootId, name: currentSpace.title } : null
  const breadcrumb = root ? [root, ...path] : []
  const currentFolder: Crumb = breadcrumb[breadcrumb.length - 1] ?? { id: '', name: '' }

  // A different folder starts on its first page (adjusted during render so no request is made for the stale page).
  if (pagedFolderId !== currentFolder.id) {
    setPagedFolderId(currentFolder.id)
    setPage(0)
    setTotalItems(0)
  }

  useEffect(() => {
    pagingRef.current = { page, pageSize, sortKey, sortDir }
  }, [page, pageSize, sortKey, sortDir])

  /** Loads the page currently selected (or `target`), ignoring the result if a newer load started meanwhile. */
  const loadFolder = useCallback(async (folderId: string, target?: number) => {
    const seq = ++loadSeq.current
    const p = target ?? pagingRef.current.page
    const { pageSize: size, sortKey: by, sortDir: dir } = pagingRef.current
    setLoading(true)
    setError(null)
    let reloading = false
    try {
      const result = await api.listChildrenPage(folderId, { skip: p * size, maxItems: size, sortBy: by, sortDir: dir })
      if (seq !== loadSeq.current) return
      if (result.items.length === 0 && result.totalItems > 0 && p > 0) {
        // The page emptied (e.g. its last items were deleted): fall back to the last page that still exists.
        reloading = true
        setTotalItems(result.totalItems)
        setPage(Math.ceil(result.totalItems / size) - 1)
        return
      }
      setNodes(result.items)
      setTotalItems(result.totalItems)
      setSelected(new Set())
    } catch (e) {
      if (seq === loadSeq.current) setError(String(e))
    } finally {
      // When falling back, the page change triggers the next load, which owns the loading state.
      if (seq === loadSeq.current && !reloading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    api
      .me()
      .then((user) => {
        setUsername(user.username)
        setFirstName(user.firstName)
        setIsAdmin(user.isAdmin)
      })
      .catch(() => setUsername(null))
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    if (!username) return
    api
      .listSpaces()
      .then(setSpaces)
      .catch((e) => {
        setSpaces([])
        setError(String(e))
      })
  }, [username])

  const applyAppearance = useCallback((a: Appearance) => {
    setAppearance(a)
    setFallbackStyle(a.style)
    cacheAppStyle(a.style)
  }, [])

  const reloadAppearance = useCallback(() => {
    api
      .getAppearance()
      .then(applyAppearance)
      .catch(() => {}) // keep the layout already showing
  }, [applyAppearance])

  useEffect(() => {
    if (username) reloadAppearance()
  }, [username, reloadAppearance])

  const reloadTemplates = useCallback(() => {
    api
      .listFolderTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([])) // the New menu just has no template entries
  }, [])

  useEffect(() => {
    if (username) reloadTemplates()
  }, [username, reloadTemplates])

  // Refetch whenever the user moves between views so notices and the rail badge stay current (no polling).
  useEffect(() => {
    if (username) refreshTaskActivity()
  }, [username, view, refreshTaskActivity])

  const browsing = view === 'spaces' && root !== null
  useEffect(() => {
    if (username && browsing && pagedFolderId === currentFolder.id) loadFolder(currentFolder.id)
  }, [username, browsing, currentFolder.id, pagedFolderId, page, pageSize, sortKey, sortDir, loadFolder])

  function changePageSize(size: number) {
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(size))
    } catch {
      // storage unavailable: the choice just lasts for this session
    }
    setPageSize(size)
    setPage(0)
  }

  function changeSort(key: NodeSortKey, dir: NodeSortDir) {
    setSortKey(key)
    setSortDir(dir)
    setPage(0)
  }

  function handleNavigate(next: View) {
    if (next === 'admin' && !isAdmin) return
    setSearchResults(null)
    setPath([])
    setCurrentSpace(null)
    setDocPreview(null)
    setView(next)
  }

  function openSpace(space: Space) {
    setSearchResults(null)
    setSearchQuery('')
    setPath([])
    setDocPreview(null)
    setCurrentSpace(space)
    setSpaceTab('documents')
    setView('spaces')
  }

  /** Command-bar folder tree: open a folder anywhere (`trail` below the space's document library). */
  function openTreeFolder(space: Space, trail: Crumb[]) {
    if (space.id !== currentSpace?.id || view !== 'spaces') openSpace(space)
    else {
      setSearchResults(null)
      setSearchQuery('')
      setSpaceTab('documents')
    }
    setPath(trail)
  }

  /** Admin created or removed a space: refresh the list the rest of the app shows. */
  const reloadSpaces = useCallback(() => {
    api
      .listSpaces()
      .then(setSpaces)
      .catch((e) => setError(String(e)))
  }, [])

  function openTasks(taskId?: string) {
    setPendingTaskId(taskId ?? null)
    handleNavigate('tasks')
  }

  function handleLoggedIn(user: AuthUser) {
    setUsername(user.username)
    setFirstName(user.firstName)
    setIsAdmin(user.isAdmin)
  }

  async function handleLogout() {
    // Leave the app even if the request fails; a stale server session is better than a dead "Sign out" button.
    await api.logout().catch(() => {})
    setUsername(null)
    setFirstName('')
    setIsAdmin(false)
    setAppearance(null)
    setPaletteOpen(false)
    setDocPreview(null)
    setPendingTaskId(null)
    resetTaskActivity()
    setPath([])
    setSpaces(null)
    setTemplates([])
    setCurrentSpace(null)
    setSearchResults(null)
    setView('home')
  }

  /** Where a search hit lives: its space (matched by document-library id) and the folder trail below it. */
  function locate(node: NodeDto, includeSelf: boolean): { space: Space | null; trail: Crumb[] } {
    const ancestors = node.ancestors ?? []
    const at = ancestors.findIndex((a) => spaces?.some((s) => s.rootId === a.id))
    const space = at >= 0 ? (spaces?.find((s) => s.rootId === ancestors[at].id) ?? null) : null
    const trail = at >= 0 ? ancestors.slice(at + 1).map((a) => ({ id: a.id, name: a.name })) : []
    if (includeSelf) trail.push({ id: node.id, name: node.name })
    return { space, trail }
  }

  const locationLabel = (node: NodeDto) => {
    const { space, trail } = locate(node, false)
    return [...(space ? [space.title] : []), ...trail.map((c) => c.name)].join(' / ')
  }

  function openLocation(node: NodeDto, includeSelf: boolean) {
    const { space, trail } = locate(node, includeSelf)
    if (!space) return
    setSearchResults(null)
    setCurrentSpace(space)
    setPath(trail)
  }

  function clearSearch() {
    setSearchResults(null)
    setSearchQuery('')
  }

  function openFolder(node: NodeDto) {
    if (searchResults) return openLocation(node, true)
    setPath((prev) => [...prev, { id: node.id, name: node.name }])
  }

  function goToBreadcrumb(index: number) {
    setSearchResults(null)
    setPath((prev) => prev.slice(0, index))
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const uploadFilesTo = useCallback(
    async (parentId: string, files: File[]) => {
      if (files.length === 0) return
      setLoading(true)
      setError(null)
      try {
        for (const file of files) {
          await api.uploadFile(parentId, file)
        }
        if (parentId === currentFolder.id) await loadFolder(currentFolder.id)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [currentFolder.id, loadFolder],
  )

  const uploadFiles = useCallback((files: File[]) => uploadFilesTo(currentFolder.id, files), [uploadFilesTo, currentFolder.id])

  const pickFiles = useCallback(() => fileInputRef.current?.click(), [])

  async function handleUploadInput(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /** Throws on failure so the dialog can show the message inline. */
  async function handleCreateFolder(name: string) {
    await api.createFolder(currentFolder.id, name)
    setCreatingFolder(false)
    await loadFolder(currentFolder.id)
  }

  async function handleDelete(node: NodeDto) {
    try {
      await api.deleteNode(node.id)
      if (preview?.id === node.id) closeDetails()
      await loadFolder(currentFolder.id)
    } catch (err) {
      setError(String(err))
    } finally {
      setNodeToDelete(null)
    }
  }

  /** Rename throws on failure so the dialog can show the API's message inline. */
  async function handleRename(node: NodeDto, name: string) {
    await api.renameNode(node.id, name)
    setRowDialog(null)
    setError(null)
    if (searchResults) setSearchResults(await api.search(searchQuery))
    else await loadFolder(currentFolder.id)
  }

  /** Single-item copy/move: same flow as the bulk actions, with one id. */
  async function handleRowTransfer(kind: 'copy' | 'move', node: NodeDto, targetId: string) {
    setBulkProgress({ done: 0, total: 1 })
    setError(null)
    try {
      await (kind === 'copy' ? api.copyNode(node.id, targetId) : api.moveNode(node.id, targetId))
      if (kind === 'move' && preview?.id === node.id) closeDetails()
      setSelected(new Set())
      setRowDialog(null)
      await loadFolder(currentFolder.id)
    } catch (err) {
      setError(`${node.name}: ${String(err)}`)
      setRowDialog(null)
    } finally {
      setBulkProgress(null)
    }
  }

  /** Throws on failure so the dialog can show the message inline. */
  async function handleCreateFromTemplate(template: FolderTemplate, name: string) {
    await api.createFromTemplate(currentFolder.id, template.id, name)
    setTemplateToCreate(null)
    await loadFolder(currentFolder.id)
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault()
    runSearch(searchQuery)
  }

  async function runSearch(query: string) {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults(null)
      return
    }
    // Search is global (top bar, all spaces the user can read); results show in the Spaces listing.
    if (view !== 'spaces') {
      setCurrentSpace(null)
      setPath([])
      setDocPreview(null)
      setView('spaces')
    }
    setLoading(true)
    setError(null)
    try {
      setSearchResults(await api.search(query))
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleAll(ids: string[], select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  /** Selected files in the order the list shows (previewFiles is the table's sorted file order): the dialog's starting order. */
  function mergeCandidates(): NodeDto[] {
    const ordered = previewFiles.some((f) => selected.has(f.id)) ? previewFiles : displayedNodes
    return ordered.filter((n) => selected.has(n.id))
  }

  async function handleMerge(fileName: string, orderedIds: string[]) {
    setBulkProgress({ done: 0, total: 1 })
    setError(null)
    let mergedId: string | null = null
    try {
      const merged = await api.merge(orderedIds, currentFolder.id, fileName)
      mergedId = merged.id
    } catch (err) {
      setError(String(err))
    } finally {
      setBulkProgress(null)
      setBulkDialog(null)
      await loadFolder(currentFolder.id)
    }
    if (mergedId) {
      // Briefly mark the new document's row once the reloaded list shows it.
      window.clearTimeout(highlightTimer.current)
      setHighlightedId(mergedId)
      highlightTimer.current = window.setTimeout(() => setHighlightedId(null), 2000)
    }
  }

  /** Runs `action` over the selected items one at a time, finishing the rest after a failure, then reports and refreshes. */
  async function runBulk(action: (node: NodeDto) => Promise<unknown>) {
    const items = selectedNodes
    let ok = 0
    let firstError: string | null = null
    setError(null)
    setBulkProgress({ done: 0, total: items.length })
    for (const [i, node] of items.entries()) {
      try {
        await action(node)
        ok++
      } catch (err) {
        firstError ??= `${node.name}: ${String(err)}`
      }
      setBulkProgress({ done: i + 1, total: items.length })
    }
    if (firstError) setError(`${ok} of ${items.length} succeeded. First error: ${firstError}`)
    setBulkProgress(null)
    setBulkDialog(null)
    setSelected(new Set())
    await loadFolder(currentFolder.id)
  }

  const displayedNodes = searchResults ?? nodes
  const selectedNodes = displayedNodes.filter((n) => selected.has(n.id))
  const allFilesSelected = selectedNodes.every((n) => n.isFile)
  const canCompare = selectedNodes.length === 2 && allFilesSelected
  const progressLabel = (verb: string) => (bulkProgress ? `${verb} ${bulkProgress.done} of ${bulkProgress.total}…` : `${verb}…`)
  const selectedFileIds = selectedNodes.filter((n) => n.isFile).map((n) => n.id)
  // Copy/move/merge/delete pick or refresh the browsed folder, so search results only offer Download (and Compare).
  const nothingSelected = selectedNodes.length === 0
  const selectFirst = 'Select documents first'
  const inSearch = 'Open the containing folder first'
  const selectionActions: SelectionActions = {
    download: {
      available: selectedFileIds.length > 0,
      hint: nothingSelected ? selectFirst : 'Folders can’t be downloaded',
      run: () => downloadNodes(selectedFileIds),
    },
    compare: { available: canCompare, hint: 'Select exactly two documents to compare them', run: () => setComparing(true) },
    merge: {
      available: !searchResults && allFilesSelected && selectedNodes.length > 1,
      hint: searchResults
        ? 'Open the folder to merge its documents.'
        : allFilesSelected
          ? 'Select two or more documents to merge them into one PDF.'
          : 'Only documents can be merged; deselect the folders.',
      run: () => setBulkDialog('merge'),
    },
    copy: { available: !nothingSelected && !searchResults, hint: nothingSelected ? selectFirst : inSearch, run: () => setBulkDialog('copy') },
    move: { available: !nothingSelected && !searchResults, hint: nothingSelected ? selectFirst : inSearch, run: () => setBulkDialog('move') },
    delete: { available: !nothingSelected && !searchResults, hint: nothingSelected ? selectFirst : inSearch, run: () => setBulkDialog('delete') },
  }
  const previewInScope =
    preview !== null &&
    preview.view === view &&
    preview.folderId === currentFolder.id &&
    preview.searchResults === searchResults
  const previewId = previewInScope ? preview.id : null
  const previewNode = browsing && previewId ? (previewFiles.find((f) => f.id === previewId) ?? null) : null
  const docPreviewNode = docPreview?.view === view ? docPreview.node : null
  const paneNode = docPreviewNode ?? (previewFull ? previewNode : null)
  const detailsNode = docPreviewNode ? null : previewNode
  const previewOpen = paneNode !== null
  /** Closing the full preview returns to the details panel; closing a task/recent document closes it entirely. */
  const closePreview = useCallback(() => {
    setPreviewFull(false)
    setDocPreview(null)
  }, [])
  const closeDetails = useCallback(() => {
    setPreview(null)
    setPreviewFull(false)
  }, [])
  const selectPreview = useCallback(
    (n: NodeDto) => {
      setDocPreview(null)
      setPreview({ id: n.id, view, folderId: currentFolder.id, searchResults })
      addRecentDoc(n)
    },
    [view, currentFolder.id, searchResults, addRecentDoc],
  )

  async function openRecent(doc: RecentDocument) {
    try {
      const node = await api.getNode(doc.id)
      setPreview(null)
      setDocPreview({ node, view })
      addRecentDoc(node)
    } catch (e) {
      recentDocs.remove(doc.id)
      setError(`Couldn’t open ${doc.name}. ${apiErrorMessage(e)}`)
    }
  }

  const userDisplayName = (() => {
    const name = taskActivity.displayNameOf(username ?? '')
    return name && name !== username ? name : firstName || username || ''
  })()
  // Viewers (site role SiteConsumer) can read but not add documents; Alfresco enforces it, this hides the buttons.
  const canWrite = isAdmin || currentSpace?.role !== 'SiteConsumer'
  const canCreateFolder = isAdmin || currentSpace?.role === 'SiteManager' || currentSpace?.role === 'SiteCollaborator'

  async function switchStyle(style: AppStyle) {
    try {
      applyAppearance(await api.setMyStyle(style))
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  /** Everything the command palette offers; what is listed follows the user's role and the folder being browsed. */
  function paletteCommands(): Command[] {
    const icon = (C: typeof House) => <C size={16} strokeWidth={1.8} aria-hidden="true" />
    const inFolder = browsing && !searchResults
    return [
      ...(inFolder && canWrite
        ? [
            { id: 'upload', group: 'Create', label: `Upload files to ${currentFolder.name}`, icon: icon(Upload), keywords: 'add document', run: pickFiles },
            ...(canCreateFolder
              ? [{ id: 'folder', group: 'Create', label: 'New folder', icon: icon(FolderPlus), run: () => setCreatingFolder(true) }]
              : []),
            ...templates.map((t) => ({
              id: `template-${t.id}`,
              group: 'Create',
              label: `New ${t.name}`,
              hint: 'Folder template',
              icon: icon(Shapes),
              run: () => setTemplateToCreate(t),
            })),
          ]
        : []),
      { id: 'go-home', group: 'Go to', label: 'Home', icon: icon(House), run: () => handleNavigate('home') },
      { id: 'go-spaces', group: 'Go to', label: 'All spaces', icon: icon(FolderClosed), run: () => handleNavigate('spaces') },
      { id: 'go-tasks', group: 'Go to', label: 'Tasks', icon: icon(SquareCheckBig), keywords: 'workflow assigned', run: () => openTasks() },
      ...(isAdmin
        ? [{ id: 'go-admin', group: 'Go to', label: 'Administration', icon: icon(Settings), keywords: 'users settings', run: () => handleNavigate('admin') }]
        : []),
      { id: 'go-profile', group: 'Go to', label: 'Profile', icon: icon(UserRound), keywords: 'password account appearance', run: () => handleNavigate('profile') },
      ...(spaces ?? []).map((s) => ({
        id: `space-${s.id}`,
        group: 'Spaces',
        label: s.title,
        hint: s.description || undefined,
        icon: <span className="cmdbar-space-dot" style={spaceColor(s.id)} aria-hidden="true" />,
        keywords: 'space open',
        run: () => openSpace(s),
      })),
      ...recentDocs.docs.slice(0, 5).map((d) => ({
        id: `recent-${d.id}`,
        group: 'Recently opened',
        label: d.name,
        icon: icon(FileText),
        keywords: 'document recent',
        run: () => openRecent(d),
      })),
      ...(appearance?.allowUserChoice
        ? APP_STYLES.filter((s) => s.value !== appStyle).map((s) => ({
            id: `style-${s.value}`,
            group: 'Layout',
            label: `Switch to the ${s.label} layout`,
            icon: icon(s.value === 'three-pane' ? LayoutPanelLeft : PanelTop),
            keywords: 'appearance style view',
            run: () => switchStyle(s.value),
          }))
        : []),
      { id: 'logout', group: 'Account', label: 'Sign out', icon: icon(LogOut), keywords: 'log out', run: handleLogout },
    ]
  }

  const notificationsPanel = (close: () => void) => (
    <ActivityList
      activity={taskActivity}
      onOpenTasks={(id) => {
        close()
        openTasks(id)
      }}
      onError={setError}
    />
  )

  if (!authChecked) {
    return (
      <div className="app-loading">
        <Spinner size={24} label="Loading…" />
      </div>
    )
  }

  if (!username) {
    return <LoginForm onLoggedIn={handleLoggedIn} />
  }

  const threePane = appStyle === 'three-pane'
  const inFolderView = view === 'spaces' && (root !== null || searchResults !== null)
  const trail: TrailItem[] =
    view !== 'spaces'
      ? [{ label: VIEW_LABEL[view] }]
      : [
          { label: 'Spaces', onClick: () => handleNavigate('spaces') },
          ...(searchResults
            ? [{ label: 'Search results' }]
            : breadcrumb.map((c, i) => ({ label: c.name, onClick: () => goToBreadcrumb(i) }))),
        ]
  const atSpaceRoot = currentSpace !== null && path.length === 0 && !searchResults
  const role = currentSpace ? roleLabel(currentSpace.role).toLowerCase() : ''
  const clearSelection = () => setSelected(new Set())

  const fileTable = (
    <FileTable
      variant={threePane ? 'tile' : 'icon'}
      nodes={displayedNodes}
      loading={loading}
      selected={selected}
      highlightedId={highlightedId}
      isSearchView={!!searchResults}
      searchQuery={searchQuery}
      onToggleSelected={toggleSelected}
      onToggleAll={toggleAll}
      canSelectFolders={isAdmin}
      onOpenFolder={openFolder}
      getLocation={searchResults ? locationLabel : undefined}
      onOpenLocation={(n) => openLocation(n, false)}
      onPreview={(n) => {
        // A click in the list keeps the full preview if it is open, otherwise shows the details panel.
        if (!previewOpen) setPreviewFull(false)
        selectPreview(n)
      }}
      activeId={docPreviewNode ? null : previewId}
      onFilesOrdered={setPreviewFiles}
      ownerNameOf={taskActivity.displayNameOf}
      folderName={currentFolder.name}
      onUploadClick={pickFiles}
      onDelete={setNodeToDelete}
      canDeleteFolders={isAdmin}
      canManageFolders={isAdmin}
      onRename={(node) => setRowDialog({ kind: 'rename', node })}
      onCopy={(node) => setRowDialog({ kind: 'copy', node })}
      onMove={(node) => setRowDialog({ kind: 'move', node })}
      onDropFiles={uploadFiles}
      sortKey={searchResults ? undefined : sortKey}
      sortDir={searchResults ? undefined : sortDir}
      onSortChange={searchResults ? undefined : changeSort}
      footer={
        searchResults ? null : (
          <Pager totalItems={totalItems} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={changePageSize} />
        )
      }
    />
  )

  const detailsPanel = detailsNode && (
    <DetailsPanel
      key={detailsNode.id}
      node={detailsNode}
      ownerName={detailsNode.createdByUser ? taskActivity.displayNameOf(detailsNode.createdByUser) : ''}
      location={searchResults ? locationLabel(detailsNode) : breadcrumb.map((c) => c.name).join(' / ')}
      onOpen={() => setPreviewFull(true)}
      onClose={closeDetails}
    />
  )

  const searchHead = searchResults && (
    <Breadcrumbs
      breadcrumb={breadcrumb}
      searchResults={{ query: searchQuery, count: searchResults.length }}
      onNavigate={goToBreadcrumb}
      onClearSearch={clearSearch}
    />
  )

  /** Three-pane: page title, the space's description and New / Upload above a card with the list. */
  const threePaneFolder = (
    <section className="folder" aria-label="Files">
      <div className="folder-head">
        {searchHead || (
          <div className="page-head">
            <h1>{currentFolder.name}</h1>
            {atSpaceRoot ? (
              currentSpace.description && <p>{currentSpace.description}</p>
            ) : (
              <p>In {breadcrumb.slice(0, -1).map((c) => c.name).join(' / ')}</p>
            )}
          </div>
        )}
        {!searchResults && (
          <Toolbar
            refreshing={loading}
            canCreateFolder={canCreateFolder}
            canUpload={canWrite}
            templates={templates}
            onUpload={pickFiles}
            onNewFolder={() => setCreatingFolder(true)}
            onNewFromTemplate={(id) => setTemplateToCreate(templates.find((t) => t.id === id) ?? null)}
            onRefresh={() => loadFolder(currentFolder.id)}
          />
        )}
      </div>
      <div className="sheet">{fileTable}</div>
    </section>
  )

  /** Command bar: trail, title with the user's role, description, Documents / Members tabs and a flat list. */
  const showMembersTab = isAdmin && currentSpace !== null && !searchResults
  const commandBarFolder = (
    <section className="folder" aria-label="Files">
      <Trail items={trail} chevrons />
      {searchHead || (
        <div className="cb-title">
          <div className="cb-title-row">
            <h1>{currentFolder.name}</h1>
            {currentSpace && (
              <span className="cb-role">
                You are {/^[aeiou]/.test(role) ? 'an' : 'a'} {role}
              </span>
            )}
          </div>
          {atSpaceRoot && currentSpace.description && <p className="cb-desc">{currentSpace.description}</p>}
        </div>
      )}
      {showMembersTab && (
        <div className="cb-tabs" role="tablist" aria-label={`${currentSpace.title} sections`}>
          {(['documents', 'members'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={spaceTab === t}
              className={`cb-tab${spaceTab === t ? ' active' : ''}`}
              onClick={() => setSpaceTab(t)}
            >
              {t === 'documents' ? 'Documents' : 'Members'}
            </button>
          ))}
        </div>
      )}
      {showMembersTab && spaceTab === 'members' ? (
        <SpaceMembers spaceId={currentSpace.id} />
      ) : (
        <div className="folder-body">
          <div className="sheet">{fileTable}</div>
          {!previewOpen && detailsPanel}
        </div>
      )}
    </section>
  )

  const sidePanel =
    threePane && inFolderView && !previewOpen ? (
      selectedNodes.length > 0 ? (
        <SelectionPanel selected={selectedNodes} actions={selectionActions} onClear={clearSelection} />
      ) : detailsNode ? (
        <aside className="side-panel">{detailsPanel}</aside>
      ) : currentSpace && !searchResults ? (
        <SpaceInfoPanel space={currentSpace} />
      ) : null
    ) : null

  return (
    <div
      className={`shell shell-${appStyle}${previewOpen ? ' has-preview' : ''}`}
      style={{ '--preview-ratio': previewRatio } as CSSProperties}
    >
      {threePane ? (
        <>
          <Sidebar
            displayName={userDisplayName}
            isAdmin={isAdmin}
            view={view}
            taskBadge={taskActivity.badgeCount}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
          {view === 'spaces' && !previewOpen && (
            <SpacesColumn
              spaces={spaces}
              currentSpaceId={currentSpace?.id ?? null}
              isAdmin={isAdmin}
              onOpenSpace={openSpace}
              onOpenAll={() => handleNavigate('spaces')}
              onNewSpace={() => handleNavigate('admin')}
            />
          )}
        </>
      ) : (
        <>
          <div className="cb-top">
            <TopHeader
              displayName={userDisplayName}
              view={view}
              onNavigate={handleNavigate}
              onLogout={handleLogout}
              searchQuery={searchResults ? searchQuery : ''}
              onOpenPalette={openPalette}
              notificationCount={taskActivity.badgeCount}
              notifications={notificationsPanel}
            />
            <CommandBar
              inFolder={browsing && !searchResults}
              canUpload={canWrite}
              canCreateFolder={canCreateFolder}
              templates={templates}
              onUpload={pickFiles}
              onNewFolder={() => setCreatingFolder(true)}
              onNewFromTemplate={(id) => setTemplateToCreate(templates.find((t) => t.id === id) ?? null)}
              selectedCount={selectedNodes.length}
              actions={selectionActions}
              onClearSelection={clearSelection}
            />
          </div>
          <FolderTree
            view={view}
            isAdmin={isAdmin}
            taskBadge={taskActivity.badgeCount}
            spaces={spaces}
            currentSpaceId={currentSpace?.id ?? null}
            path={path}
            refreshKey={nodes}
            onNavigate={handleNavigate}
            onOpenAllSpaces={() => handleNavigate('spaces')}
            onOpen={openTreeFolder}
          />
        </>
      )}

      <div className="content">
        {threePane && (
          <Topbar
            title={<Trail items={trail} />}
            searchQuery={searchQuery}
            hasSearchResults={!!searchResults}
            onSearchQueryChange={setSearchQuery}
            onSearchSubmit={handleSearch}
            onClearSearch={clearSearch}
            notificationCount={taskActivity.badgeCount}
            notifications={notificationsPanel}
          />
        )}
        <input type="file" multiple ref={fileInputRef} hidden onChange={handleUploadInput} aria-hidden="true" tabIndex={-1} />

        <main className="main">
          {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}

          {view === 'home' && (
            <HomePage
              name={firstName || userDisplayName}
              activity={taskActivity}
              recent={recentDocs.docs}
              spaces={spaces}
              onOpenSpace={openSpace}
              onOpenSpaces={() => handleNavigate('spaces')}
              onOpenTasks={openTasks}
              onOpenRecent={openRecent}
            />
          )}

          {view === 'tasks' ? (
            <TasksPage
              username={username}
              assignees={taskActivity.assignees}
              nameOf={taskActivity.nameOf}
              pendingTaskId={pendingTaskId}
              onPendingConsumed={clearPendingTask}
              spaces={spaces ?? []}
              activePreviewId={docPreviewNode?.id ?? null}
              onPreview={(node) => {
                setPreview(null)
                setDocPreview({ node, view: 'tasks' })
              }}
              onError={setError}
            />
          ) : view === 'profile' ? (
            <ProfilePage username={username} onProfileUpdated={() => {}} appearance={appearance} onAppearanceChange={applyAppearance} />
          ) : view === 'admin' ? (
            isAdmin ? (
              <AdministrationPage
                spaces={spaces}
                onSpacesChanged={reloadSpaces}
                onTemplatesChanged={reloadTemplates}
                onAppearanceChanged={reloadAppearance}
              />
            ) : null
          ) : view === 'home' ? null : !inFolderView ? (
            <SpacesPage spaces={spaces} isAdmin={isAdmin} onOpen={openSpace} />
          ) : threePane ? (
            threePaneFolder
          ) : (
            commandBarFolder
          )}
        </main>
      </div>

      {sidePanel}

      {paneNode && (
        <PreviewPane
          key={paneNode.id}
          node={paneNode}
          files={docPreviewNode ? [docPreviewNode] : previewFiles}
          ratio={previewRatio}
          onRatioChange={changePreviewRatio}
          expanded={previewExpanded}
          onExpandedChange={setPreviewExpanded}
          onSelect={selectPreview}
          onClose={closePreview}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands()}
          initialQuery={searchResults ? searchQuery : ''}
          onSearch={runSearch}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {templateToCreate && (
        <NewFromTemplateDialog
          template={templateToCreate}
          parentName={currentFolder.name}
          onCreate={(name) => handleCreateFromTemplate(templateToCreate, name)}
          onCancel={() => setTemplateToCreate(null)}
        />
      )}

      {creatingFolder && (
        <NewFolderDialog parentName={currentFolder.name} onCreate={handleCreateFolder} onCancel={() => setCreatingFolder(false)} />
      )}

      {nodeToDelete && (
        <ConfirmDialog
          title={`Delete ${nodeToDelete.isFolder ? 'folder' : 'file'}?`}
          message={`“${nodeToDelete.name}” will be deleted${nodeToDelete.isFolder ? ' along with everything inside it' : ''}.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(nodeToDelete)}
          onCancel={() => setNodeToDelete(null)}
        />
      )}

      {rowDialog?.kind === 'rename' && (
        <RenameDialog
          key={rowDialog.node.id}
          name={rowDialog.node.name}
          isFolder={rowDialog.node.isFolder}
          onRename={(name) => handleRename(rowDialog.node, name)}
          onCancel={() => setRowDialog(null)}
        />
      )}

      {browsing && !searchResults && root && rowDialog && rowDialog.kind !== 'rename' && (
        <FolderPickerDialog
          title={`${rowDialog.kind === 'copy' ? 'Copy' : 'Move'} “${rowDialog.node.name}” to…`}
          confirmLabel={rowDialog.kind === 'copy' ? 'Copy here' : 'Move here'}
          busyLabel={rowDialog.kind === 'copy' ? 'Copying…' : 'Moving…'}
          busy={bulkProgress !== null}
          root={root}
          excludedIds={new Set(rowDialog.node.isFolder ? [rowDialog.node.id] : [])}
          disabledTargetId={rowDialog.kind === 'move' ? currentFolder.id : undefined}
          disabledTargetHint="This item is already in this folder."
          onConfirm={(targetId) => handleRowTransfer(rowDialog.kind as 'copy' | 'move', rowDialog.node, targetId)}
          onCancel={() => setRowDialog(null)}
        />
      )}

      {comparing && canCompare && (
        <ComparePreview
          left={selectedNodes[0]}
          right={selectedNodes[1]}
          onClose={() => setComparing(false)}
        />
      )}

      {browsing && !searchResults && bulkDialog === 'merge' && (
        <MergeDialog
          files={mergeCandidates()}
          busy={bulkProgress !== null}
          onMerge={handleMerge}
          onCancel={() => setBulkDialog(null)}
        />
      )}

      {browsing && !searchResults && root && (bulkDialog === 'copy' || bulkDialog === 'move') && (
        <FolderPickerDialog
          title={`${bulkDialog === 'copy' ? 'Copy' : 'Move'} ${plural(selectedNodes.length, 'item')} to…`}
          confirmLabel={bulkDialog === 'copy' ? 'Copy here' : 'Move here'}
          busyLabel={progressLabel(bulkDialog === 'copy' ? 'Copying' : 'Moving')}
          busy={bulkProgress !== null}
          root={root}
          excludedIds={new Set(selectedNodes.filter((n) => n.isFolder).map((n) => n.id))}
          disabledTargetId={bulkDialog === 'move' ? currentFolder.id : undefined}
          disabledTargetHint="These items are already in this folder."
          onConfirm={(targetId) =>
            runBulk((n) => (bulkDialog === 'copy' ? api.copyNode(n.id, targetId) : api.moveNode(n.id, targetId)))
          }
          onCancel={() => setBulkDialog(null)}
        />
      )}

      {browsing && !searchResults && bulkDialog === 'delete' && (
        <ConfirmDialog
          title={`Delete ${plural(selectedNodes.length, 'item')}?`}
          message={`${plural(selectedNodes.length, 'selected item')} will be deleted${selectedNodes.some((n) => n.isFolder) ? ', including everything inside any folders' : ''}.`}
          confirmLabel="Delete"
          busyLabel={progressLabel('Deleting')}
          onConfirm={() => runBulk((n) => api.deleteNode(n.id))}
          onCancel={() => setBulkDialog(null)}
        />
      )}
    </div>
  )
}

export default App

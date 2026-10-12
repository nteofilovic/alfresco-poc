import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, FormEvent } from 'react'
import { api, type AuthUser, type NodeDto, type Workspace } from './api'
import { LoginForm } from './LoginForm'
import { SearchBar, Topbar } from './components/Topbar'
import { Breadcrumbs } from './components/Breadcrumbs'
import { Toolbar } from './components/Toolbar'
import { FileTable } from './components/FileTable'
import { AdministrationPage } from './components/AdministrationPage'
import { ProfilePage } from './components/ProfilePage'
import { TasksPage } from './components/TasksPage'
import { ActivityPanel } from './components/ActivityPanel'
import { useTaskActivity } from './hooks/useTaskActivity'
import { PreviewPane, RATIO_MAX, RATIO_MIN } from './components/PreviewPane'
import { ConfirmDialog } from './components/ConfirmDialog'
import { MergeDialog } from './components/MergeDialog'
import { RenameDialog } from './components/RenameDialog'
import { FolderPickerDialog } from './components/FolderPickerDialog'
import type { MenuAction } from './components/ActionsMenu'
import { ErrorToast } from './components/ErrorToast'
import { Spinner } from './components/Spinner'
import { EmptyState } from './components/EmptyState'
import { Copy, FileStack, FolderInput, FolderOpen, Trash2 } from 'lucide-react'
import './App.css'

interface Crumb {
  id: string
  name: string
}

type View = 'workspace' | 'tasks' | 'browse' | 'admin' | 'profile'

const PREVIEW_RATIO_KEY = 'zapis.previewRatio'

const ROOT: Crumb = { id: '-my-', name: 'Home' }

function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [path, setPath] = useState<Crumb[]>([]) // folders below the current view's root
  const [rootOverride, setRootOverride] = useState<Crumb | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [nodes, setNodes] = useState<NodeDto[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NodeDto[] | null>(null)
  const [bulkDialog, setBulkDialog] = useState<'merge' | 'copy' | 'move' | 'delete' | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  // The preview belongs to the listing it was opened from; it closes when view, folder or search results change.
  const [preview, setPreview] = useState<{
    id: string
    view: View
    folderId: string
    searchResults: NodeDto[] | null
  } | null>(null)
  // A document opened from a task; it takes over the preview pane until closed or the user leaves the Workspace view.
  const [taskPreview, setTaskPreview] = useState<NodeDto | null>(null)
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
  const [view, setView] = useState<View>('workspace')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // A task id to open when the Tasks page mounts (deep link from an activity notice).
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const clearPendingTask = useCallback(() => setPendingTaskId(null), [])
  const taskActivity = useTaskActivity(username)
  const refreshTaskActivity = taskActivity.refresh
  const resetTaskActivity = taskActivity.reset

  // Admins' "Documents" view starts at their Home folder; the Workspace view starts at the workspace's document library.
  const baseRoot: Crumb | null = view === 'workspace' ? (workspace?.rootId ? { id: workspace.rootId, name: workspace.name } : null) : ROOT
  // A search hit outside the view's normal root (admins only) re-roots the trail at the repository root.
  const root = rootOverride ?? baseRoot
  const breadcrumb = root ? [root, ...path] : []
  const currentFolder = breadcrumb[breadcrumb.length - 1] ?? ROOT

  const loadFolder = useCallback(async (folderId: string) => {
    setLoading(true)
    setError(null)
    try {
      const children = await api.listChildren(folderId)
      setNodes(children)
      setSelected(new Set())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
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
      .getWorkspace()
      .then(setWorkspace)
      .catch((e) => setError(String(e)))
  }, [username])

  // Refetch whenever the user moves between views so notices and the rail badge stay current (no polling).
  useEffect(() => {
    if (username) refreshTaskActivity()
  }, [username, view, refreshTaskActivity])

  const browsing = (view === 'browse' || view === 'workspace') && root !== null
  useEffect(() => {
    if (username && browsing) loadFolder(currentFolder.id)
  }, [username, browsing, currentFolder.id, loadFolder])

  function handleNavigate(next: View) {
    if ((next === 'admin' || next === 'browse') && !isAdmin) return
    setSearchResults(null)
    setPath([])
    setRootOverride(null)
    setTaskPreview(null)
    setView(next)
  }

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
    await api.logout()
    setUsername(null)
    setFirstName('')
    setIsAdmin(false)
    setTaskPreview(null)
    setPendingTaskId(null)
    resetTaskActivity()
    setPath([])
    setRootOverride(null)
    setWorkspace(null)
    setSearchResults(null)
    setView('workspace')
  }

  /** Where a search hit lives, as a trail relative to the view's root (or the repository root if it's outside it). */
  function locate(node: NodeDto, includeSelf: boolean): { override: Crumb | null; trail: Crumb[] } {
    const ancestors = node.ancestors ?? []
    const at = baseRoot ? ancestors.findIndex((a) => a.id === baseRoot.id) : -1
    const override = at >= 0 || ancestors.length === 0 ? null : { id: ancestors[0].id, name: ancestors[0].name }
    const trail = ancestors.slice(at >= 0 ? at + 1 : 1).map((a) => ({ id: a.id, name: a.name }))
    if (includeSelf) trail.push({ id: node.id, name: node.name })
    return { override, trail }
  }

  const locationLabel = (node: NodeDto) => {
    const { override, trail } = locate(node, false)
    const start = override ?? baseRoot
    return [...(start ? [start] : []), ...trail].map((c) => c.name).join(' / ')
  }

  function openLocation(node: NodeDto, includeSelf: boolean) {
    const { override, trail } = locate(node, includeSelf)
    setSearchResults(null)
    setRootOverride(override)
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

  async function handleUploadInput(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleNewFolderIn = useCallback(
    async (parentId: string) => {
      const name = window.prompt('Folder name')
      if (!name) return
      setLoading(true)
      try {
        await api.createFolder(parentId, name)
        if (parentId === currentFolder.id) await loadFolder(currentFolder.id)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [currentFolder.id, loadFolder],
  )

  const handleNewFolder = useCallback(() => handleNewFolderIn(currentFolder.id), [handleNewFolderIn, currentFolder.id])

  async function handleDelete(node: NodeDto) {
    try {
      await api.deleteNode(node.id)
      if (preview?.id === node.id) closePreview()
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
      if (kind === 'move' && preview?.id === node.id) closePreview()
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

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setSearchResults(await api.search(searchQuery))
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

  async function handleMerge(fileName: string) {
    setBulkProgress({ done: 0, total: 1 })
    setError(null)
    try {
      // Merge in the order the list shows (previewFiles is the table's sorted file order).
      const ordered = previewFiles.some((f) => selected.has(f.id)) ? previewFiles : displayedNodes
      await api.merge(
        ordered.filter((n) => selected.has(n.id)).map((n) => n.id),
        currentFolder.id,
        fileName,
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setBulkProgress(null)
      setBulkDialog(null)
      await loadFolder(currentFolder.id)
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
  const progressLabel = (verb: string) => (bulkProgress ? `${verb} ${bulkProgress.done} of ${bulkProgress.total}…` : `${verb}…`)
  const bulkActions: MenuAction[] = [
    ...(allFilesSelected
      ? [{ key: 'merge', label: 'Merge to PDF', icon: <FileStack size={15} aria-hidden="true" />, onSelect: () => setBulkDialog('merge') }]
      : []),
    { key: 'copy', label: 'Copy to…', icon: <Copy size={15} aria-hidden="true" />, onSelect: () => setBulkDialog('copy') },
    { key: 'move', label: 'Move to…', icon: <FolderInput size={15} aria-hidden="true" />, onSelect: () => setBulkDialog('move') },
    { key: 'delete', label: 'Delete', icon: <Trash2 size={15} aria-hidden="true" />, danger: true, onSelect: () => setBulkDialog('delete') },
  ]
  const previewInScope =
    preview !== null &&
    preview.view === view &&
    preview.folderId === currentFolder.id &&
    preview.searchResults === searchResults
  const previewId = previewInScope ? preview.id : null
  const previewNode = previewId ? (previewFiles.find((f) => f.id === previewId) ?? null) : null
  const showingTasks = view === 'tasks'
  const taskPreviewNode = showingTasks ? taskPreview : null
  const paneNode = taskPreviewNode ?? (browsing ? previewNode : null)
  const previewOpen = paneNode !== null
  const closePreview = useCallback(() => {
    setPreview(null)
    setTaskPreview(null)
  }, [])
  const selectPreview = useCallback(
    (n: NodeDto) => {
      setTaskPreview(null)
      setPreview({ id: n.id, view, folderId: currentFolder.id, searchResults })
    },
    [view, currentFolder.id, searchResults],
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

  return (
    <div
      className={`shell${previewOpen ? ' has-preview' : ''}`}
      style={{ '--preview-ratio': previewRatio } as CSSProperties}
    >
      <Topbar username={username} isAdmin={isAdmin} view={view} taskBadge={taskActivity.badgeCount} onNavigate={handleNavigate} onLogout={handleLogout} />

      <main className="main">
        {view !== 'admin' && view !== 'profile' && view !== 'tasks' && (
          <SearchBar
            searchQuery={searchQuery}
            hasSearchResults={!!searchResults}
            onSearchQueryChange={setSearchQuery}
            onSearchSubmit={handleSearch}
            onClearSearch={clearSearch}
          />
        )}

        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}

        {view === 'workspace' && !searchResults && (
          <ActivityPanel
            username={username}
            firstName={firstName}
            activity={taskActivity}
            onOpenTasks={openTasks}
            onError={setError}
          />
        )}

        {view === 'tasks' ? (
          <TasksPage
            username={username}
            assignees={taskActivity.assignees}
            nameOf={taskActivity.nameOf}
            pendingTaskId={pendingTaskId}
            onPendingConsumed={clearPendingTask}
            pickerRoot={workspace?.rootId ? { id: workspace.rootId, name: workspace.name } : null}
            activePreviewId={taskPreviewNode?.id ?? null}
            onPreview={(node) => {
              setPreview(null)
              setTaskPreview(node)
            }}
            onError={setError}
          />
        ) : view === 'profile' ? (
          <ProfilePage username={username} onProfileUpdated={() => {}} />
        ) : view === 'admin' ? (
          isAdmin ? <AdministrationPage workspace={workspace} onWorkspaceCreated={setWorkspace} /> : null
        ) : !root ? (
          <section className="folder">
            <div className="sheet">
              {workspace === null ? (
                <div className="admin-placeholder">
                  <Spinner size={22} label="Loading workspace…" />
                </div>
              ) : (
                <EmptyState
                  icon={FolderOpen}
                  title="The workspace isn't set up yet"
                  description={
                    isAdmin
                      ? 'Open Administration and design the folder structure to get started.'
                      : 'Ask an administrator to set up the workspace.'
                  }
                />
              )}
            </div>
          </section>
        ) : (
          <section className="folder">
            <Breadcrumbs
              breadcrumb={breadcrumb}
              searchResults={searchResults ? { query: searchQuery, count: searchResults.length } : null}
              onNavigate={goToBreadcrumb}
              onClearSearch={clearSearch}
            />

            <div className="sheet">
              <Toolbar
                fileInputRef={fileInputRef}
                disabled={!!searchResults}
                refreshing={loading}
                canCreateFolder={isAdmin}
                selectedCount={selectedNodes.length}
                bulkActions={bulkActions}
                onUpload={handleUploadInput}
                onNewFolder={handleNewFolder}
                onRefresh={() => loadFolder(currentFolder.id)}
              />

              <FileTable
                nodes={displayedNodes}
                loading={loading}
                selected={selected}
                isSearchView={!!searchResults}
                searchQuery={searchQuery}
                onToggleSelected={toggleSelected}
                onToggleAll={toggleAll}
                canSelectFolders={isAdmin}
                onOpenFolder={openFolder}
                getLocation={searchResults ? locationLabel : undefined}
                onOpenLocation={(n) => openLocation(n, false)}
                onPreview={selectPreview}
                activeId={previewOpen && !taskPreviewNode ? previewId : null}
                onFilesOrdered={setPreviewFiles}
                onDelete={setNodeToDelete}
                canDeleteFolders={isAdmin}
                canManageFolders={isAdmin}
                onRename={(node) => setRowDialog({ kind: 'rename', node })}
                onCopy={(node) => setRowDialog({ kind: 'copy', node })}
                onMove={(node) => setRowDialog({ kind: 'move', node })}
                onDropFiles={uploadFiles}
              />
            </div>
          </section>
        )}
      </main>

      {paneNode && (
        <PreviewPane
          key={paneNode.id}
          node={paneNode}
          files={taskPreviewNode ? [taskPreviewNode] : previewFiles}
          ratio={previewRatio}
          onRatioChange={changePreviewRatio}
          expanded={previewExpanded}
          onExpandedChange={setPreviewExpanded}
          onSelect={selectPreview}
          onClose={closePreview}
        />
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

      {browsing && !searchResults && bulkDialog === 'merge' && (
        <MergeDialog
          count={selectedNodes.length}
          busy={bulkProgress !== null}
          onMerge={handleMerge}
          onCancel={() => setBulkDialog(null)}
        />
      )}

      {browsing && !searchResults && root && (bulkDialog === 'copy' || bulkDialog === 'move') && (
        <FolderPickerDialog
          title={`${bulkDialog === 'copy' ? 'Copy' : 'Move'} ${selectedNodes.length} items to…`}
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
          title={`Delete ${selectedNodes.length} items?`}
          message={`${selectedNodes.length} selected items will be deleted${selectedNodes.some((n) => n.isFolder) ? ', including everything inside any folders' : ''}.`}
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

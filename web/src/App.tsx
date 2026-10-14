import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, FormEvent } from 'react'
import { api, type AuthUser, type NodeDto, type Workspace } from './api'
import { LoginForm } from './LoginForm'
import { Sidebar, type View } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Breadcrumbs } from './components/Breadcrumbs'
import { Toolbar } from './components/Toolbar'
import { SelectionBar } from './components/SelectionBar'
import { FileTable } from './components/FileTable'
import { DetailsPanel } from './components/DetailsPanel'
import { AdministrationPage } from './components/AdministrationPage'
import { ProfilePage } from './components/ProfilePage'
import { TasksPage } from './components/TasksPage'
import { ActivityList } from './components/ActivityPanel'
import { WorkspaceOverview } from './components/WorkspaceOverview'
import { useTaskActivity } from './hooks/useTaskActivity'
import { useRecentDocuments, type RecentDocument } from './hooks/useRecentDocuments'
import { PreviewPane, RATIO_MAX, RATIO_MIN } from './components/PreviewPane'
import { ConfirmDialog } from './components/ConfirmDialog'
import { MergeDialog } from './components/MergeDialog'
import { RenameDialog } from './components/RenameDialog'
import { FolderPickerDialog } from './components/FolderPickerDialog'
import type { MenuAction } from './components/ActionsMenu'
import { ErrorToast } from './components/ErrorToast'
import { Spinner } from './components/Spinner'
import { EmptyState } from './components/EmptyState'
import { downloadNodes } from './download'
import { apiErrorMessage } from './formatters'
import { Copy, Download, FileStack, FolderInput, FolderOpen, Trash2 } from 'lucide-react'
import './App.css'

interface Crumb {
  id: string
  name: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
  const [view, setView] = useState<View>('workspace')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // A task id to open when the Tasks page mounts (deep link from an activity notice).
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const clearPendingTask = useCallback(() => setPendingTaskId(null), [])
  const taskActivity = useTaskActivity(username)
  const refreshTaskActivity = taskActivity.refresh
  const resetTaskActivity = taskActivity.reset
  const recentDocs = useRecentDocuments(username)
  const addRecentDoc = recentDocs.add

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
    setDocPreview(null)
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
    // Leave the app even if the request fails; a stale server session is better than a dead "Sign out" button.
    await api.logout().catch(() => {})
    setUsername(null)
    setFirstName('')
    setIsAdmin(false)
    setDocPreview(null)
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

  const pickFiles = useCallback(() => fileInputRef.current?.click(), [])

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

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    // Search is global (top bar); results show in the Workspace listing unless a document view is already open.
    if (view !== 'workspace' && view !== 'browse') handleNavigate('workspace')
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
  const selectedFileIds = selectedNodes.filter((n) => n.isFile).map((n) => n.id)
  // Copy/move/merge/delete pick or refresh the browsed folder, so search results only offer Download.
  const bulkActions: MenuAction[] = [
    {
      key: 'download',
      label: 'Download',
      icon: <Download size={15} aria-hidden="true" />,
      disabled: selectedFileIds.length === 0,
      hint: 'Folders can’t be downloaded',
      onSelect: () => downloadNodes(selectedFileIds),
    },
    ...(searchResults
      ? []
      : [
          ...(allFilesSelected && selectedNodes.length > 1
            ? [{ key: 'merge', label: 'Merge to PDF', icon: <FileStack size={15} aria-hidden="true" />, onSelect: () => setBulkDialog('merge') }]
            : []),
          { key: 'copy', label: 'Copy', icon: <Copy size={15} aria-hidden="true" />, onSelect: () => setBulkDialog('copy') },
          { key: 'move', label: 'Move', icon: <FolderInput size={15} aria-hidden="true" />, onSelect: () => setBulkDialog('move') },
          { key: 'delete', label: 'Delete', icon: <Trash2 size={15} aria-hidden="true" />, danger: true, onSelect: () => setBulkDialog('delete') },
        ]),
  ]
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
  const canUploadHere = browsing && !searchResults
  const companyName = workspace?.exists ? workspace.name : ''

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
      <Sidebar
        displayName={userDisplayName}
        isAdmin={isAdmin}
        companyName={companyName}
        view={view}
        taskBadge={taskActivity.badgeCount}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />

      <div className="content">
        <Topbar
          searchQuery={searchQuery}
          hasSearchResults={!!searchResults}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={handleSearch}
          onClearSearch={clearSearch}
          notificationCount={taskActivity.badgeCount}
          notifications={(close) => (
            <ActivityList
              activity={taskActivity}
              onOpenTasks={(id) => {
                close()
                openTasks(id)
              }}
              onError={setError}
            />
          )}
          onUpload={canUploadHere ? pickFiles : null}
          uploadHint={searchResults ? 'Clear the search to upload into a folder' : 'Open a folder in the Workspace to upload'}
          onNewFolder={canUploadHere && isAdmin ? handleNewFolder : null}
          newFolderHint={isAdmin ? 'Open a folder to create a folder in it' : 'Only administrators can create folders'}
        />
        <input type="file" multiple ref={fileInputRef} hidden onChange={handleUploadInput} aria-hidden="true" tabIndex={-1} />

        <main className="main">
          {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}

          {view === 'workspace' && !searchResults && (
            <WorkspaceOverview
              name={firstName || userDisplayName}
              activity={taskActivity}
              recent={recentDocs.docs}
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
              pickerRoot={workspace?.rootId ? { id: workspace.rootId, name: workspace.name } : null}
              activePreviewId={docPreviewNode?.id ?? null}
              onPreview={(node) => {
                setPreview(null)
                setDocPreview({ node, view: 'tasks' })
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
            <section className="folder" aria-label="Files">
              <div className="folder-head">
                <Breadcrumbs
                  breadcrumb={breadcrumb}
                  searchResults={searchResults ? { query: searchQuery, count: searchResults.length } : null}
                  onNavigate={goToBreadcrumb}
                  onClearSearch={clearSearch}
                />
                {!searchResults && (
                  <Toolbar
                    refreshing={loading}
                    canCreateFolder={isAdmin}
                    onUpload={pickFiles}
                    onNewFolder={handleNewFolder}
                    onRefresh={() => loadFolder(currentFolder.id)}
                  />
                )}
              </div>

              {selectedNodes.length > 0 && (
                <SelectionBar count={selectedNodes.length} actions={bulkActions} onClear={() => setSelected(new Set())} />
              )}

              <div className="folder-body">
                <div className="sheet">
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
                  />
                </div>

                {detailsNode && !previewOpen && (
                  <DetailsPanel
                    key={detailsNode.id}
                    node={detailsNode}
                    ownerName={detailsNode.createdByUser ? taskActivity.displayNameOf(detailsNode.createdByUser) : ''}
                    location={searchResults ? locationLabel(detailsNode) : breadcrumb.map((c) => c.name).join(' / ')}
                    onOpen={() => setPreviewFull(true)}
                    onClose={closeDetails}
                  />
                )}
              </div>
            </section>
          )}
        </main>
      </div>

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

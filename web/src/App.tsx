import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { api, type NodeDto } from './api'
import { LoginForm } from './LoginForm'
import { Topbar } from './components/Topbar'
import { Breadcrumbs } from './components/Breadcrumbs'
import { Toolbar } from './components/Toolbar'
import { FileTable } from './components/FileTable'
import { PreviewModal } from './components/PreviewModal'
import { MergeBar } from './components/MergeBar'
import { ErrorToast } from './components/ErrorToast'
import { Spinner } from './components/Spinner'
import './App.css'

interface Crumb {
  id: string
  name: string
}

const ROOT: Crumb = { id: '-my-', name: 'Home' }

function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([ROOT])
  const [nodes, setNodes] = useState<NodeDto[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NodeDto[] | null>(null)
  const [mergeFileName, setMergeFileName] = useState('merged-document')
  const [merging, setMerging] = useState(false)
  const [previewNode, setPreviewNode] = useState<NodeDto | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentFolder = breadcrumb[breadcrumb.length - 1]

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
      .then((user) => setUsername(user.username))
      .catch(() => setUsername(null))
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    if (username) loadFolder(currentFolder.id)
  }, [username, currentFolder.id, loadFolder])

  async function handleLogout() {
    await api.logout()
    setUsername(null)
    setBreadcrumb([ROOT])
    setSearchResults(null)
  }

  function openFolder(node: NodeDto) {
    setSearchResults(null)
    setBreadcrumb((prev) => [...prev, { id: node.id, name: node.name }])
  }

  function goToBreadcrumb(index: number) {
    setSearchResults(null)
    setBreadcrumb((prev) => prev.slice(0, index + 1))
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setLoading(true)
      setError(null)
      try {
        for (const file of files) {
          await api.uploadFile(currentFolder.id, file)
        }
        await loadFolder(currentFolder.id)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [currentFolder.id, loadFolder],
  )

  async function handleUploadInput(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleNewFolder() {
    const name = window.prompt('Folder name')
    if (!name) return
    setLoading(true)
    try {
      await api.createFolder(currentFolder.id, name)
      await loadFolder(currentFolder.id)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(node: NodeDto) {
    if (!window.confirm(`Delete "${node.name}"?`)) return
    try {
      await api.deleteNode(node.id)
      await loadFolder(currentFolder.id)
    } catch (err) {
      setError(String(err))
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

  async function handleMerge() {
    if (selected.size < 2) return
    setMerging(true)
    setError(null)
    try {
      const orderedIds = displayedNodes
        .filter((n) => selected.has(n.id))
        .map((n) => n.id)
      await api.merge(orderedIds, currentFolder.id, mergeFileName)
      await loadFolder(currentFolder.id)
    } catch (err) {
      setError(String(err))
    } finally {
      setMerging(false)
    }
  }

  const displayedNodes = searchResults ?? nodes
  const mergeableSelectedCount = displayedNodes.filter((n) => selected.has(n.id) && n.isFile).length

  if (!authChecked) {
    return (
      <div className="app-loading">
        <Spinner size={24} label="Loading…" />
      </div>
    )
  }

  if (!username) {
    return <LoginForm onLoggedIn={setUsername} />
  }

  return (
    <div className="app">
      <Topbar
        username={username}
        searchQuery={searchQuery}
        hasSearchResults={!!searchResults}
        onSearchQueryChange={setSearchQuery}
        onSearchSubmit={handleSearch}
        onClearSearch={() => setSearchResults(null)}
        onLogout={handleLogout}
      />

      <Breadcrumbs
        breadcrumb={breadcrumb}
        searchResults={searchResults ? { query: searchQuery, count: searchResults.length } : null}
        onNavigate={goToBreadcrumb}
      />

      <Toolbar
        fileInputRef={fileInputRef}
        disabled={!!searchResults}
        refreshing={loading}
        onUpload={handleUploadInput}
        onNewFolder={handleNewFolder}
        onRefresh={() => loadFolder(currentFolder.id)}
      />

      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}

      <FileTable
        nodes={displayedNodes}
        loading={loading}
        selected={selected}
        isSearchView={!!searchResults}
        searchQuery={searchQuery}
        onToggleSelected={toggleSelected}
        onOpenFolder={openFolder}
        onPreview={setPreviewNode}
        onDelete={handleDelete}
        onDropFiles={uploadFiles}
      />

      {previewNode && <PreviewModal node={previewNode} onClose={() => setPreviewNode(null)} />}

      {mergeableSelectedCount > 0 && (
        <MergeBar
          selectedCount={mergeableSelectedCount}
          fileName={mergeFileName}
          merging={merging}
          disabled={!!searchResults}
          onFileNameChange={setMergeFileName}
          onMerge={handleMerge}
        />
      )}
    </div>
  )
}

export default App

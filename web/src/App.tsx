import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type NodeDto } from './api'
import { formatBytes, formatDate, iconFor } from './formatters'
import { LoginForm } from './LoginForm'
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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setLoading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await api.uploadFile(currentFolder.id, file)
      }
      await loadFolder(currentFolder.id)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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

  async function handleSearch(e: React.FormEvent) {
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
    return <div className="loading">Loading…</div>
  }

  if (!username) {
    return <LoginForm onLoggedIn={setUsername} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Document Workspace</h1>
        <form className="search" onSubmit={handleSearch}>
          <input
            placeholder="Search all documents…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit">Search</button>
          {searchResults && (
            <button type="button" className="ghost" onClick={() => setSearchResults(null)}>
              Clear
            </button>
          )}
        </form>
        <div className="user-menu">
          <span className="username">{username}</span>
          <button type="button" className="ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {!searchResults && (
        <nav className="breadcrumb">
          {breadcrumb.map((c, i) => (
            <span key={c.id}>
              {i > 0 && <span className="sep">/</span>}
              <button className="link" onClick={() => goToBreadcrumb(i)}>
                {c.name}
              </button>
            </span>
          ))}
        </nav>
      )}
      {searchResults && (
        <div className="breadcrumb">
          <span>Search results for "{searchQuery}" ({searchResults.length})</span>
        </div>
      )}

      <div className="toolbar">
        <button onClick={() => fileInputRef.current?.click()} disabled={!!searchResults}>
          ⬆ Upload
        </button>
        <input type="file" multiple ref={fileInputRef} hidden onChange={handleUpload} />
        <button onClick={handleNewFolder} disabled={!!searchResults}>
          + New folder
        </button>
        <button onClick={() => loadFolder(currentFolder.id)}>↻ Refresh</button>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Loading…</div>}

      <table className="node-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Modified</th>
            <th>Size</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {displayedNodes.map((node) => (
            <tr key={node.id} className={selected.has(node.id) ? 'selected' : ''}>
              <td>
                {node.isFile && (
                  <input
                    type="checkbox"
                    checked={selected.has(node.id)}
                    onChange={() => toggleSelected(node.id)}
                    title="Select for merge"
                  />
                )}
              </td>
              <td className="name-cell">
                <span className="icon">{iconFor(node.name, node.isFolder)}</span>
                {node.isFolder ? (
                  <button className="link" onClick={() => openFolder(node)}>
                    {node.name}
                  </button>
                ) : (
                  <a href={api.downloadUrl(node.id)}>{node.name}</a>
                )}
              </td>
              <td>{formatDate(node.modifiedAt)}</td>
              <td>{node.isFile ? formatBytes(node.sizeInBytes) : '—'}</td>
              <td>
                <button className="ghost danger" onClick={() => handleDelete(node)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {displayedNodes.length === 0 && !loading && (
            <tr>
              <td colSpan={5} className="empty">
                No documents here yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {mergeableSelectedCount > 0 && (
        <div className="merge-bar">
          <span>{mergeableSelectedCount} file(s) selected</span>
          <input
            value={mergeFileName}
            onChange={(e) => setMergeFileName(e.target.value)}
            placeholder="merged-document"
          />
          <button
            onClick={handleMerge}
            disabled={mergeableSelectedCount < 2 || merging || !!searchResults}
            title={mergeableSelectedCount < 2 ? 'Select at least 2 files' : ''}
          >
            {merging ? 'Merging…' : `Merge into one PDF`}
          </button>
        </div>
      )}
    </div>
  )
}

export default App

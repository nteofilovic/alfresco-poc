// Thin fetch wrapper around the Spring Boot API. Kept dependency-free on
// purpose - a small POC has no need for a data-fetching library yet.

export interface NodeDto {
  id: string
  name: string
  isFolder: boolean
  isFile: boolean
  nodeType: string
  mimeType: string | null
  sizeInBytes: number | null
  createdAt: string | null
  modifiedAt: string | null
  createdByUser: string | null
  aspectNames: string[]
  properties: Record<string, unknown>
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface AuthUser {
  username: string
}

export const api = {
  listChildren: (nodeId: string) =>
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}/children`, { credentials: 'include' }).then((r) =>
      handle<NodeDto[]>(r),
    ),

  getNode: (nodeId: string) =>
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}`, { credentials: 'include' }).then((r) => handle<NodeDto>(r)),

  createFolder: (parentId: string, name: string) =>
    fetch(`/api/nodes/${encodeURIComponent(parentId)}/folders`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => handle<NodeDto>(r)),

  uploadFile: (parentId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`/api/nodes/${encodeURIComponent(parentId)}/files`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    }).then((r) => handle<NodeDto>(r))
  },

  deleteNode: (nodeId: string) =>
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}`, { method: 'DELETE', credentials: 'include' }).then((r) =>
      handle<void>(r),
    ),

  downloadUrl: (nodeId: string) => `/api/nodes/${encodeURIComponent(nodeId)}/content`,

  search: (q: string) =>
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: 'include' }).then((r) => handle<NodeDto[]>(r)),

  merge: (nodeIds: string[], targetParentId: string, fileName: string) =>
    fetch('/api/merge', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeIds, targetParentId, fileName }),
    }).then((r) => handle<NodeDto>(r)),

  login: (username: string, password: string) =>
    fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then((r) => handle<AuthUser>(r)),

  logout: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then((r) => handle<void>(r)),

  me: () => fetch('/api/auth/me', { credentials: 'include' }).then((r) => handle<AuthUser>(r)),
}

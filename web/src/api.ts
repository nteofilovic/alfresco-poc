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
  /** Root-first folder chain (id + name); only populated for search results. */
  ancestors?: { id: string; name: string }[]
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
  firstName: string
  isAdmin: boolean
}

export interface NewUser {
  username: string
  firstName: string
  lastName: string
  email: string
  password: string
}

export interface ManagedUser {
  username: string
  firstName: string
  lastName: string
  email: string
  enabled: boolean
  protectedAccount: boolean
}

export interface FolderTemplateNode {
  name: string
  children: FolderTemplateNode[]
}

export interface Workspace {
  exists: boolean
  name: string
  rootId: string | null
}

export interface Profile {
  username: string
  firstName: string
  lastName: string
  email: string
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

  renameNode: (nodeId: string, name: string) =>
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}/name`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => handle<NodeDto>(r)),

  moveNode: (nodeId: string, targetParentId: string) =>
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}/move`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetParentId }),
    }).then((r) => handle<NodeDto>(r)),

  copyNode: (nodeId: string, targetParentId: string) =>
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}/copy`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetParentId }),
    }).then((r) => handle<NodeDto>(r)),

  downloadUrl: (nodeId: string) => `/api/nodes/${encodeURIComponent(nodeId)}/content`,

  previewUrl: (nodeId: string) => `/api/nodes/${encodeURIComponent(nodeId)}/preview`,

  // 204 means "no preview for this file type" - not an error, so this returns null rather than throwing.
  fetchPreview: async (nodeId: string): Promise<{ blob: Blob; contentType: string } | null> => {
    const res = await fetch(api.previewUrl(nodeId), { credentials: 'include' })
    if (res.status === 204) return null
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText}: ${body}`)
    }
    const blob = await res.blob()
    return { blob, contentType: res.headers.get('Content-Type') ?? blob.type }
  },

  search: (q: string) =>
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: 'include' }).then((r) => handle<NodeDto[]>(r)),

  recentDocuments: (maxItems = 20) =>
    fetch(`/api/nodes/recent?maxItems=${maxItems}`, { credentials: 'include' }).then((r) => handle<NodeDto[]>(r)),

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

  createUser: (user: NewUser) =>
    fetch('/api/admin/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    }).then((r) => handle<ManagedUser>(r)),

  getWorkspace: () => fetch('/api/workspace', { credentials: 'include' }).then((r) => handle<Workspace>(r)),

  createWorkspace: (folders: FolderTemplateNode[]) =>
    fetch('/api/admin/workspace', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folders }),
    }).then((r) => handle<Workspace>(r)),

  listUsers: () => fetch('/api/admin/users', { credentials: 'include' }).then((r) => handle<ManagedUser[]>(r)),

  setUserEnabled: (username: string, enabled: boolean) =>
    fetch(`/api/admin/users/${encodeURIComponent(username)}/enabled`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then((r) => handle<ManagedUser>(r)),

  deleteUser: (username: string) =>
    fetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE', credentials: 'include' }).then(
      (r) => handle<void>(r),
    ),

  getProfile: () => fetch('/api/profile', { credentials: 'include' }).then((r) => handle<Profile>(r)),

  updateProfile: (profile: Pick<Profile, 'firstName' | 'lastName' | 'email'>) =>
    fetch('/api/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    }).then((r) => handle<Profile>(r)),

  changePassword: (currentPassword: string, newPassword: string) =>
    fetch('/api/profile/password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then((r) => handle<void>(r)),

  me: () => fetch('/api/auth/me', { credentials: 'include' }).then((r) => handle<AuthUser>(r)),
}

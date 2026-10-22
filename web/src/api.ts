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
  /** A PDF that has an annotated copy (set on listings and search results). */
  hasAnnotations?: boolean
}

/** A sticky note to add to a PDF; x/y are fractions (0..1) of the page from its top-left corner. */
export interface StickyNote {
  page: number
  x: number
  y: number
  text: string
  /** Icon colour as #rrggbb. */
  color: string
}

/** State of a PDF's annotations; `revision` is what a save must send back to detect concurrent edits. */
export interface AnnotationInfo {
  exists: boolean
  /** The original got a new version after the annotations were made. */
  outdated: boolean
  baseVersion: string | null
  currentVersion: string | null
  revision: number
  updatedBy: string | null
  updatedAt: string | null
}

async function fetchBlob(url: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  const blob = await res.blob()
  return { blob, contentType: res.headers.get('Content-Type') ?? blob.type }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** The API sends null for an empty description/message (and could for attachments); components expect strings/arrays. */
function normalizeTask(t: TaskDto): TaskDto {
  return {
    ...t,
    description: t.description ?? '',
    message: t.message ?? '',
    attachments: t.attachments ?? [],
    siteId: t.siteId ?? null,
    siteTitle: t.siteTitle ?? null,
    unreadMessages: t.unreadMessages ?? 0,
    messageCount: t.messageCount ?? 0,
  }
}

const taskListsInFlight = new Map<TaskScope, Promise<TaskDto[]>>()

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

/** A business area of the company (an Alfresco Share site). `rootId` is its document library. */
export interface Space {
  id: string
  title: string
  description: string
  visibility: string
  /** The caller's site role; null for admins who are not members. */
  role: string | null
  rootId: string
}

export type SpaceRole = 'SiteManager' | 'SiteCollaborator' | 'SiteContributor' | 'SiteConsumer'

export interface NewSpace {
  id?: string
  title: string
  description: string
  visibility: 'PRIVATE' | 'MODERATED' | 'PUBLIC'
}

/** Admin-designed template for something members create in a space (a Client, Property...): a named folder plus fixed subfolders. */
export interface FolderTemplate {
  id: string
  name: string
  description: string
  /** Subfolders created inside every folder made from this template. */
  folders: FolderTemplateNode[]
}

export type NewFolderTemplate = Pick<FolderTemplate, 'name' | 'description' | 'folders'>

export interface SpaceMember {
  username: string
  displayName: string
  role: SpaceRole
}

export interface Profile {
  username: string
  firstName: string
  lastName: string
  email: string
}

/** Layout of the whole app: "three-pane" (sidebar, list, details) or "command-bar" (top bar and command palette). */
export type AppStyle = 'three-pane' | 'command-bar'

export interface Appearance {
  /** The layout to render now. */
  style: AppStyle
  /** The user's own choice; null when they follow the application default. */
  userStyle: AppStyle | null
  defaultStyle: AppStyle
  allowUserChoice: boolean
}

export type AppearanceSettings = Pick<Appearance, 'defaultStyle' | 'allowUserChoice'>

export type TaskStatus = 'new' | 'in_progress' | 'on_hold' | 'cancelled' | 'done'
export type TaskScope = 'assigned' | 'created'

export interface TaskAttachment {
  id: string
  name: string
  /** False when the viewer has no access to the document in Alfresco (not a member of its space). */
  accessible?: boolean
}

export interface TaskDto {
  id: string
  title: string
  description: string
  createdAt: string
  /** ISO date (yyyy-MM-dd) or full ISO timestamp. */
  dueDate: string | null
  /** Usernames. */
  creator: string
  assignee: string
  status: TaskStatus
  /** Legacy single note from before task conversations; the conversation itself is `getTaskMessages`. */
  message: string
  attachments: TaskAttachment[]
  resolved: boolean
  /** The space the task belongs to; null when unknown. */
  siteId: string | null
  siteTitle: string | null
  /** The other party's messages the viewer has not opened yet. */
  unreadMessages: number
  /** The whole conversation, for list rows. */
  messageCount: number
}

export interface TaskMessage {
  id: string
  /** Username. */
  author: string
  text: string
  createdAt: string
}

export interface NewTask {
  title: string
  description: string
  dueDate: string
  assignee: string
  attachmentIds: string[]
  siteId?: string
}

/** A push from the server about a task; `from` is the username who caused it, `title` may be null. */
export interface LiveEvent {
  type: 'task-assigned' | 'task-message' | 'task-updated' | 'task-completed'
  taskId: string
  title: string | null
  from: string
}

export interface TaskNotification {
  id: string
  taskId: string
  title: string
  assignee: string
  resolvedAt: string
}

export interface TaskAssignee {
  username: string
  displayName: string
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export type NodeSortKey = 'name' | 'modifiedAt' | 'owner' | 'sizeInBytes'
export type NodeSortDir = 'asc' | 'desc'

/** One page of a folder listing; folders come first, then the chosen sort, all computed server-side. */
export interface NodePage {
  items: NodeDto[]
  totalItems: number
  skip: number
  maxItems: number
  hasMore: boolean
}

export interface NodePageQuery {
  skip: number
  maxItems: number
  sortBy: NodeSortKey
  sortDir: NodeSortDir
}

export const api = {
  listChildrenPage: (nodeId: string, { skip, maxItems, sortBy, sortDir }: NodePageQuery) =>
    fetch(
      `/api/nodes/${encodeURIComponent(nodeId)}/page?skip=${skip}&maxItems=${maxItems}&sortBy=${sortBy}&sortDir=${sortDir}`,
      { credentials: 'include' },
    ).then((r) => handle<NodePage>(r)),

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

  /** The original file is never changed by annotating; this is the copy that carries them (404 when there is none). */
  annotatedDownloadUrl: (nodeId: string) => `/api/nodes/${encodeURIComponent(nodeId)}/content?annotations=true`,

  getAnnotations: (nodeId: string) =>
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}/annotations`, { credentials: 'include' }).then((r) =>
      handle<AnnotationInfo>(r),
    ),

  /** Stores the annotated PDF next to the original; rejects with 409 when someone saved since `baseRevision`. */
  saveAnnotations: (nodeId: string, pdf: Uint8Array<ArrayBuffer>, notes: StickyNote[], baseRevision: number) => {
    const form = new FormData()
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'document.pdf')
    if (notes.length > 0) form.append('notes', new Blob([JSON.stringify(notes)], { type: 'application/json' }))
    return fetch(`/api/nodes/${encodeURIComponent(nodeId)}/annotations?baseRevision=${baseRevision}`, {
      method: 'PUT',
      credentials: 'include',
      body: form,
    }).then((r) => handle<AnnotationInfo>(r))
  },

  deleteAnnotations: (nodeId: string) =>
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}/annotations`, { method: 'DELETE', credentials: 'include' }).then((r) =>
      handle<void>(r),
    ),

  fetchAnnotatedPreview: (nodeId: string) => fetchBlob(`/api/nodes/${encodeURIComponent(nodeId)}/annotations/content`),

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

  search: (q: string, siteId?: string) =>
    fetch(`/api/search?q=${encodeURIComponent(q)}${siteId ? `&siteId=${encodeURIComponent(siteId)}` : ''}`, {
      credentials: 'include',
    }).then((r) => handle<NodeDto[]>(r)),

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

  listSpaces: () => fetch('/api/spaces', { credentials: 'include' }).then((r) => handle<Space[]>(r)),

  createSpace: (space: NewSpace) => fetch('/api/admin/spaces', jsonInit('POST', space)).then((r) => handle<Space>(r)),

  deleteSpace: (id: string) =>
    fetch(`/api/admin/spaces/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }).then((r) =>
      handle<void>(r),
    ),

  listSpaceMembers: (id: string) =>
    fetch(`/api/admin/spaces/${encodeURIComponent(id)}/members`, { credentials: 'include' }).then((r) =>
      handle<SpaceMember[]>(r),
    ),

  addSpaceMember: (id: string, username: string, role: SpaceRole) =>
    fetch(`/api/admin/spaces/${encodeURIComponent(id)}/members`, jsonInit('POST', { username, role })).then((r) =>
      handle<void>(r),
    ),

  listFolderTemplates: () =>
    fetch('/api/folder-templates', { credentials: 'include' }).then((r) => handle<FolderTemplate[]>(r)),

  createFolderTemplate: (template: NewFolderTemplate) =>
    fetch('/api/admin/folder-templates', jsonInit('POST', template)).then((r) => handle<FolderTemplate>(r)),

  updateFolderTemplate: (id: string, template: NewFolderTemplate) =>
    fetch(`/api/admin/folder-templates/${encodeURIComponent(id)}`, jsonInit('PUT', template)).then((r) =>
      handle<FolderTemplate>(r),
    ),

  deleteFolderTemplate: (id: string) =>
    fetch(`/api/admin/folder-templates/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }).then(
      (r) => handle<void>(r),
    ),

  /** Creates a folder named `name` from the template inside `parentId` (the member's current folder). */
  createFromTemplate: (parentId: string, templateId: string, name: string) =>
    fetch(`/api/nodes/${encodeURIComponent(parentId)}/from-template`, jsonInit('POST', { templateId, name })).then((r) =>
      handle<NodeDto>(r),
    ),

  removeSpaceMember: (id: string, username: string) =>
    fetch(`/api/admin/spaces/${encodeURIComponent(id)}/members/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      credentials: 'include',
    }).then((r) => handle<void>(r)),

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

  getAppearance: () => fetch('/api/appearance', { credentials: 'include' }).then((r) => handle<Appearance>(r)),

  /** null returns the user to the application default. */
  setMyStyle: (style: AppStyle | null) =>
    fetch('/api/appearance/me', jsonInit('PUT', { style })).then((r) => handle<Appearance>(r)),

  getAppearanceSettings: () =>
    fetch('/api/admin/appearance', { credentials: 'include' }).then((r) => handle<AppearanceSettings>(r)),

  updateAppearanceSettings: (settings: AppearanceSettings) =>
    fetch('/api/admin/appearance', jsonInit('PUT', settings)).then((r) => handle<AppearanceSettings>(r)),

  me: () => fetch('/api/auth/me', { credentials: 'include' }).then((r) => handle<AuthUser>(r)),

  // The Tasks page and the activity badge ask for the same lists at the same moment; they share one request.
  listTasks: (scope: TaskScope) => {
    const running = taskListsInFlight.get(scope)
    if (running) return running
    const request = fetch(`/api/tasks?scope=${scope}`, { credentials: 'include' })
      .then((r) => handle<TaskDto[]>(r))
      .then((list) => list.map(normalizeTask))
      .finally(() => taskListsInFlight.delete(scope))
    taskListsInFlight.set(scope, request)
    return request
  },

  getTask: (id: string) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}`, { credentials: 'include' })
      .then((r) => handle<TaskDto>(r))
      .then(normalizeTask),

  createTask: (task: NewTask) =>
    fetch('/api/tasks', jsonInit('POST', task))
      .then((r) => handle<TaskDto>(r))
      .then(normalizeTask),

  updateTask: (id: string, changes: { status?: TaskStatus; message?: string }) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}`, jsonInit('PUT', changes))
      .then((r) => handle<TaskDto>(r))
      .then(normalizeTask),

  resolveTask: (id: string, message?: string, cancelled?: boolean) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}/resolve`, jsonInit('POST', { message, cancelled }))
      .then((r) => handle<TaskDto>(r))
      .then(normalizeTask),

  /** Opening the conversation marks it read for the caller. */
  getTaskMessages: (id: string) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}/messages`, { credentials: 'include' }).then((r) => handle<TaskMessage[]>(r)),

  postTaskMessage: (id: string, text: string) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}/messages`, jsonInit('POST', { text })).then((r) => handle<TaskMessage>(r)),

  taskNotifications: () =>
    fetch('/api/tasks/notifications', { credentials: 'include' }).then((r) => handle<TaskNotification[]>(r)),

  dismissTaskNotification: (id: string) =>
    fetch(`/api/tasks/notifications/${encodeURIComponent(id)}/dismiss`, {
      method: 'POST',
      credentials: 'include',
    }).then((r) => handle<void>(r)),

  taskAssignees: () =>
    fetch('/api/tasks/assignees', { credentials: 'include' }).then((r) => handle<TaskAssignee[]>(r)),
}

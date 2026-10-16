import type { FolderTemplateNode } from '../api'

/** A folder in the tree being edited; `id` is local only (React keys, add/remove targets). */
export interface Draft {
  id: string
  name: string
  children: Draft[]
}

export function toPayload(nodes: Draft[]): FolderTemplateNode[] {
  return nodes.map((n) => ({ name: n.name, children: toPayload(n.children) }))
}

export function fromPayload(nodes: FolderTemplateNode[]): Draft[] {
  return nodes.map((n) => ({ id: crypto.randomUUID(), name: n.name, children: fromPayload(n.children ?? []) }))
}

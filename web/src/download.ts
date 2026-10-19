import { api } from './api'

/** Starts a browser download of one URL. */
export function downloadUrl(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Starts browser downloads for the given nodes, staggered so browsers don't drop all but the first. */
export function downloadNodes(nodeIds: string[]) {
  nodeIds.forEach((id, i) => {
    window.setTimeout(() => downloadUrl(api.downloadUrl(id)), i * 400)
  })
}

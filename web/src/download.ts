import { api } from './api'

/** Starts browser downloads for the given nodes, staggered so browsers don't drop all but the first. */
export function downloadNodes(nodeIds: string[]) {
  nodeIds.forEach((id, i) => {
    window.setTimeout(() => {
      const a = document.createElement('a')
      a.href = api.downloadUrl(id)
      a.download = ''
      document.body.appendChild(a)
      a.click()
      a.remove()
    }, i * 400)
  })
}

/** One action on the selected rows; both layouts render the same set (side panel or toolbar). */
export interface SelectionAction {
  available: boolean
  /** Why the action is unavailable. */
  hint?: string
  run: () => void
}

export interface SelectionActions {
  download: SelectionAction
  compare: SelectionAction
  merge: SelectionAction
  copy: SelectionAction
  move: SelectionAction
  delete: SelectionAction
}

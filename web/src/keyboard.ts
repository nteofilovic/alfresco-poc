/** True on Apple devices, where shortcuts use ⌘ instead of Ctrl. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

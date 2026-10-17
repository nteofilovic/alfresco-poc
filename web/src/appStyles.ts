import type { AppStyle } from './api'

export interface AppStyleInfo {
  value: AppStyle
  label: string
  description: string
}

/** The app's layouts, in the order the pickers show them; the first is the built-in default. */
export const APP_STYLES: AppStyleInfo[] = [
  {
    value: 'three-pane',
    label: 'Three-pane',
    description: 'Navigation on the left, the document list in the middle and details on the right.',
  },
  {
    value: 'command-bar',
    label: 'Command bar',
    description: 'Navigation across the top and a command palette (Ctrl K) for search and quick actions.',
  },
]

export const DEFAULT_APP_STYLE: AppStyle = 'three-pane'

export const styleLabel = (style: AppStyle) => APP_STYLES.find((s) => s.value === style)?.label ?? style

const STYLE_KEY = 'zapis.appStyle'

/** The layout last rendered in this browser, so a reload does not flash the other layout before /api/appearance answers. */
export function cachedAppStyle(): AppStyle {
  try {
    const saved = localStorage.getItem(STYLE_KEY)
    return APP_STYLES.some((s) => s.value === saved) ? (saved as AppStyle) : DEFAULT_APP_STYLE
  } catch {
    return DEFAULT_APP_STYLE
  }
}

export function cacheAppStyle(style: AppStyle) {
  try {
    localStorage.setItem(STYLE_KEY, style)
  } catch {
    // storage unavailable: the next reload just starts from the default layout
  }
}

import type { CSSProperties } from 'react'

interface Tone {
  /** Pastel fill: tiles, chips, hovers. */
  fill: string
  /** Mid tone of the same hue: bars, borders, rings. */
  line: string
  /** Dark tone of the same hue for text on the fill (contrast at least 4.5:1). */
  ink: string
}

/** Pastel tones for spaces, one hue each, kept soft enough to sit next to the app's indigo accent. */
const PALETTE: Tone[] = [
  { fill: '#e0e4fb', line: '#a3adf0', ink: '#2f3a9e' }, // indigo
  { fill: '#d2f0eb', line: '#7fcfc4', ink: '#0f5f58' }, // teal
  { fill: '#fde9c4', line: '#f0c26b', ink: '#8a4a08' }, // amber
  { fill: '#fbdde3', line: '#f0a3b3', ink: '#9d1237' }, // rose
  { fill: '#e7ddfa', line: '#b9a3ee', ink: '#5b2aa8' }, // violet
  { fill: '#d9f0dc', line: '#8fd09a', ink: '#1a6a35' }, // green
  { fill: '#d5e8f7', line: '#8cc0e8', ink: '#1d5f8f' }, // blue
  { fill: '#f6dcf4', line: '#e0a2da', ink: '#86207a' }, // fuchsia
  { fill: '#fddfd0', line: '#f2ac86', ink: '#a2410d' }, // orange
  { fill: '#e3e8ee', line: '#aab6c4', ink: '#3d4a5c' }, // slate
]

/** FNV-1a: small, stable and well spread for short ids. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The tones of a space; derived from its id, so they never change and need no setting. */
export function spaceTone(spaceId: string): Tone {
  return PALETTE[hash(spaceId) % PALETTE.length]
}

/** Inline style that exposes the space's tones to CSS as `--space`, `--space-line` and `--space-ink`. */
export function spaceColor(spaceId: string): CSSProperties {
  const tone = spaceTone(spaceId)
  return { '--space': tone.fill, '--space-line': tone.line, '--space-ink': tone.ink } as CSSProperties
}

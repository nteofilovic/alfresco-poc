import type { CSSProperties } from 'react'

interface Tone {
  /** Pastel fill: cover bands, tiles, the wash behind a space. */
  fill: string
  /** Mid tone of the same hue: rings, borders, the dot in the sidebar. */
  line: string
  /** Dark tone of the same hue for text on the fill (contrast at least 4.5:1). */
  ink: string
}

/**
 * Pastel tones for spaces: twelve tones spread around the color wheel, so two spaces rarely look alike.
 * Ordered by hue; the app's own accent (indigo) is one of them.
 */
const PALETTE: Tone[] = [
  { fill: '#f1e7d6', line: '#d7bf94', ink: '#6b4f1d' }, // sand (not red: red reads as an error)
  { fill: '#fde3cf', line: '#f5b27f', ink: '#9a4309' }, // orange
  { fill: '#fbefba', line: '#e8cc59', ink: '#7a5b00' }, // yellow
  { fill: '#e8f3c8', line: '#bcd96a', ink: '#4b6a0c' }, // lime
  { fill: '#d6f1de', line: '#85cf9b', ink: '#17673a' }, // green
  { fill: '#cdf0ec', line: '#74cdc2', ink: '#0d5e57' }, // teal
  { fill: '#d2eef8', line: '#80cbe6', ink: '#0b5f7e' }, // cyan
  { fill: '#dbe6fb', line: '#93b3ee', ink: '#1f4aa3' }, // blue
  { fill: '#e1e3fa', line: '#a2a9ee', ink: '#2f379c' }, // indigo
  { fill: '#e9defa', line: '#bca5ee', ink: '#5b2aa8' }, // violet
  { fill: '#f6dcf3', line: '#e1a1d8', ink: '#85206f' }, // magenta
  { fill: '#fcdfea', line: '#f2a3c0', ink: '#a0245c' }, // pink
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

/**
 * The tones of a space. Derived from its id alone, so a space looks the same to everyone and never
 * changes; the price is that two spaces can occasionally share a color.
 */
export function spaceTone(spaceId: string): Tone {
  return PALETTE[hash(spaceId) % PALETTE.length]
}

/** Inline style that exposes the space's tones to CSS as `--space`, `--space-line` and `--space-ink`. */
export function spaceColor(spaceId: string): CSSProperties {
  const tone = spaceTone(spaceId)
  return { '--space': tone.fill, '--space-line': tone.line, '--space-ink': tone.ink } as CSSProperties
}

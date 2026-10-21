/** Zapis brand mark ("Layers"): three plates of the archive stacked in order, the newest on top. Keep in sync with public/favicon.svg. */
const PLATES = [
  { dy: 13, top: '#123f31', side: '#0a2a20' },
  { dy: 7, top: '#1f7a58', side: '#175f46' },
  { dy: 1, top: '#8fdcb9', side: '#5fb990' },
]

export function LayersMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {PLATES.map(({ dy, top, side }) => (
        <g key={dy}>
          <path d={`M2 ${dy + 7}L16 ${dy + 14}V${dy + 17}L2 ${dy + 10}Z`} fill={side} />
          <path d={`M30 ${dy + 7}L16 ${dy + 14}V${dy + 17}L30 ${dy + 10}Z`} fill={side} opacity="0.85" />
          <path d={`M16 ${dy}L30 ${dy + 7}L16 ${dy + 14}L2 ${dy + 7}Z`} fill={top} />
        </g>
      ))}
    </svg>
  )
}

export type CoralKind = 'staghorn' | 'fan' | 'bud'

// Corals drawn on a 120 x 140 box, rooted at (60, 140). Polyps sit on the branch tips and
// open on hover; bubbles leave from the same tips.
const STAGHORN = {
  branches: [
    'M60 140 C60 112 57 96 50 78 C44 62 40 46 42 28',
    'M56 98 C66 86 76 74 80 54 C82 42 88 32 94 24',
    'M49 74 C38 66 30 54 25 40',
    'M79 60 C87 56 94 50 100 42',
  ],
  tips: [
    [42, 28],
    [94, 24],
    [25, 40],
    [100, 42],
  ],
}

const FAN_TIPS = [-56, -36, -16, 4, 24, 44].map((deg, i) => {
  const r = 104 - Math.abs(deg) * 0.35 - (i % 2) * 8
  const rad = (deg * Math.PI) / 180
  return [60 + Math.sin(rad) * r, 140 - Math.cos(rad) * r] as const
})

const FAN = {
  branches: [
    ...FAN_TIPS.map(([x, y]) => `M60 140 Q${(60 + x) / 2 + (x - 60) * 0.15} ${(140 + y) / 2} ${x.toFixed(1)} ${y.toFixed(1)}`),
    `M${FAN_TIPS[0][0].toFixed(1)} ${(FAN_TIPS[0][1] + 34).toFixed(1)} Q60 ${(FAN_TIPS[3][1] + 4).toFixed(1)} ${FAN_TIPS[5][0].toFixed(1)} ${(FAN_TIPS[5][1] + 30).toFixed(1)}`,
  ],
  tips: FAN_TIPS.map(([x, y]) => [x, y] as [number, number]),
}

const BUD = {
  branches: [
    'M60 140 C60 122 58 106 52 90',
    'M58 114 C66 106 72 98 75 86',
    'M54 100 C47 94 43 88 40 80',
  ],
  tips: [
    [52, 86],
    [75, 82],
    [40, 76],
  ],
}

const SHAPES = { staghorn: STAGHORN, fan: FAN, bud: BUD }

export function Coral({ kind }: { kind: CoralKind }) {
  const s = SHAPES[kind]
  return (
    <svg className={`tbx-coralsvg tbx-coralsvg--${kind}`} viewBox="0 0 120 140" aria-hidden="true">
      <g className="tbx-coralsvg__sway">
        {s.branches.map((d, i) => (
          <path key={i} d={d} className="tbx-coralsvg__branch" />
        ))}
        {s.tips.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r="7" className="tbx-coralsvg__polyp" style={{ animationDelay: `${i * 0.35}s` }} />
            <circle r="6" cy="-12" className="tbx-coralsvg__bubble" style={{ animationDelay: `${i * 0.7}s` }} />
            <circle r="4" cy="-10" cx="5" className="tbx-coralsvg__bubble" style={{ animationDelay: `${i * 0.7 + 1.5}s` }} />
          </g>
        ))}
      </g>
    </svg>
  )
}

// One fish, facing left; useFish flips it when it swims right.
export function Fish() {
  return (
    <svg viewBox="0 0 40 20" aria-hidden="true">
      <path d="M4 10 C10 1 24 1 31 10 C24 19 10 19 4 10 Z" className="tbx-fish__body" />
      <path d="M30 10 L39 3 L37 10 L39 17 Z" className="tbx-fish__tail" />
      <circle cx="11" cy="8.5" r="1.4" className="tbx-fish__eye" />
    </svg>
  )
}

export type CoralKind = 'staghorn' | 'fan' | 'bud' | 'brain' | 'tube' | 'table'

// Corals drawn on a 120 x 140 box, rooted at (60, 140). Polyps sit on the branch tips and
// open on hover; bubbles leave from the same tips. `masses` are filled bodies (a dome, a plate),
// `grooves` thin lines drawn over them, `rims` the open mouths on top of tubes.
type Shape = {
  masses?: string[]
  branches: string[]
  grooves?: string[]
  rims?: [number, number][]
  tips: [number, number][]
}

const STAGHORN: Shape = {
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
  return [60 + Math.sin(rad) * r, 140 - Math.cos(rad) * r] as [number, number]
})

const FAN: Shape = {
  branches: [
    ...FAN_TIPS.map(([x, y]) => `M60 140 Q${(60 + x) / 2 + (x - 60) * 0.15} ${(140 + y) / 2} ${x.toFixed(1)} ${y.toFixed(1)}`),
    `M${FAN_TIPS[0][0].toFixed(1)} ${(FAN_TIPS[0][1] + 34).toFixed(1)} Q60 ${(FAN_TIPS[3][1] + 4).toFixed(1)} ${FAN_TIPS[5][0].toFixed(1)} ${(FAN_TIPS[5][1] + 30).toFixed(1)}`,
  ],
  tips: FAN_TIPS,
}

const BUD: Shape = {
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

// A low dome with winding ridges, like a brain coral; it doesn't sway.
const BRAIN: Shape = {
  masses: ['M6 140 C6 98 30 72 60 72 C90 72 114 98 114 140 Z'],
  branches: [],
  grooves: [
    'M16 132 C20 116 32 108 44 112 C54 115 58 102 70 100 C82 98 94 106 102 122',
    'M26 138 C32 128 44 124 54 128 C64 132 72 122 84 122 C94 122 100 130 104 136',
    'M30 96 C38 88 48 86 56 90 C64 94 72 86 84 88',
    'M22 118 C26 106 34 98 30 92',
  ],
  tips: [
    [38, 84],
    [62, 76],
    [88, 86],
  ],
}

// Organ-pipe coral: a clump of upright tubes of different heights, each open at the top.
const TUBE_TOPS: [number, number][] = [
  [30, 82],
  [45, 56],
  [60, 70],
  [75, 46],
  [90, 76],
]
const TUBE: Shape = {
  masses: ['M18 140 C24 128 42 124 60 124 C78 124 96 128 102 140 Z'],
  branches: TUBE_TOPS.map(([x, y]) => `M${x} 132 L${x} ${y}`),
  rims: TUBE_TOPS,
  tips: TUBE_TOPS.map(([x, y]) => [x, y - 2] as [number, number]),
}

// Table coral: a flat plate held up on a short stalk, with small knobs along its top.
const TABLE_KNOBS: [number, number][] = [
  [20, 76],
  [40, 70],
  [60, 68],
  [80, 70],
  [100, 75],
]
const TABLE: Shape = {
  masses: ['M4 88 C18 76 42 72 60 74 C80 72 102 76 116 86 C106 96 82 98 60 97 C38 98 14 98 4 88 Z'],
  branches: ['M60 140 C60 124 57 110 60 96', ...TABLE_KNOBS.map(([x, y]) => `M${x} ${y + 9} L${x + (x - 60) * 0.06} ${y}`)],
  grooves: ['M14 90 C32 94 88 94 106 89'],
  tips: TABLE_KNOBS,
}

const SHAPES: Record<CoralKind, Shape> = {
  staghorn: STAGHORN,
  fan: FAN,
  bud: BUD,
  brain: BRAIN,
  tube: TUBE,
  table: TABLE,
}

export function Coral({ kind }: { kind: CoralKind }) {
  const s = SHAPES[kind]
  return (
    <svg className={`tbx-coralsvg tbx-coralsvg--${kind}`} viewBox="0 0 120 140" aria-hidden="true">
      <g className="tbx-coralsvg__sway">
        {s.branches.map((d, i) => (
          <path key={i} d={d} className="tbx-coralsvg__branch" />
        ))}
        {s.masses?.map((d, i) => (
          <path key={`m${i}`} d={d} className="tbx-coralsvg__mass" />
        ))}
        {s.grooves?.map((d, i) => (
          <path key={`g${i}`} d={d} className="tbx-coralsvg__groove" />
        ))}
        {s.rims?.map(([x, y], i) => (
          <ellipse key={`r${i}`} cx={x} cy={y} rx="7.5" ry="3" className="tbx-coralsvg__rim" />
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

// 「鱼果」: a line-drawn apple whose bottom notch turns inward and up into a fish head that is
// also the apple's pip (鱼果 sounds like 雨果, and the fish fits the sea).
export function YuguoIcon({ className }: { className?: string }) {
  const pip =
    'C19.4 37.9 18.4 34 19.4 30.4C20.3 26.7 22.5 23.8 24.5 21.8C26.3 23.8 28.4 26.7 29.1 30.4C30 34 28.9 37.9 25.5 40.1'
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M22.6 40.1${pip}Z`} fill="currentColor" fillOpacity="0.28" stroke="none" />
        <path
          strokeWidth="2.4"
          d={`M24 14C20.5 11 9 10.5 8.4 21.5C7.8 31 13 41.5 18.6 41.5C20.6 41.5 22 40.9 22.6 40.1${pip}C26 40.9 27.4 41.5 29.4 41.5C35 41.5 40.2 31 39.6 21.5C39 10.5 27.5 11 24 14Z`}
        />
        <path strokeWidth="2.4" d="M24 14C24 11 25 8.5 27.5 6.5" />
        <path strokeWidth="2" d="M25.8 10C27.8 6.8 32 6 34.2 7.2C32.8 10.2 28.6 11.2 25.8 10Z" />
        <circle cx="25.7" cy="29.1" r="1.6" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

// 「雷蜂」: a honeycomb of seven flat-topped hexagons sharing their walls (one in the middle, six
// around it) with a lightning bolt in the middle cell. Every stage (雷蜂 → 靁蜂 → 靐蜂 → 䨻蜂)
// uses it; the medal's colour shows the stage.
const COMB = [
  'M32.2 9.8L28.1 16.9L19.9 16.9L15.8 9.8L19.9 2.7L28.1 2.7Z',
  'M19.9 16.9L15.8 24L7.6 24L3.5 16.9L7.6 9.8L15.8 9.8Z',
  'M44.5 16.9L40.4 24L32.2 24L28.1 16.9L32.2 9.8L40.4 9.8Z',
  'M19.9 31.1L15.8 38.2L7.6 38.2L3.5 31.1L7.6 24L15.8 24Z',
  'M44.5 31.1L40.4 38.2L32.2 38.2L28.1 31.1L32.2 24L40.4 24Z',
  'M32.2 38.2L28.1 45.3L19.9 45.3L15.8 38.2L19.9 31.1L28.1 31.1Z',
]
const MIDDLE = 'M32.2 24L28.1 31.1L19.9 31.1L15.8 24L19.9 16.9L28.1 16.9Z'

export function BeeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2">
        {COMB.map((d) => (
          <path key={d} d={d} fill="currentColor" fillOpacity="0.12" />
        ))}
        <path d={MIDDLE} fill="currentColor" fillOpacity="0.35" />
        <path
          d="M26.2 17.8L20 25.6H24.2L22.2 30.6L28.4 22.4H24.1Z"
          fill="currentColor"
          stroke="none"
        />
      </g>
    </svg>
  )
}

// 「鲷苗人」: a bream (鲷) seen from the side with a sprout growing from its back, which grows into
// a tree as the stages go (鲷苗人 → 鲷木人 → 鲷树人 → 鲈鲟哥儿). Every stage uses it; the medal's
// colour shows the stage.
export function WriterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          strokeWidth="2.4"
          fill="currentColor"
          fillOpacity="0.28"
          d="M6.5 31C11 22.5 22 20.5 31.5 26.5L40.5 21L39 31L40.5 41L31.5 35.5C22 41.5 11 39.5 6.5 31Z"
        />
        <path strokeWidth="2" d="M17.5 26C19.8 29 19.8 33 17.5 36" />
        <circle cx="12.4" cy="29.6" r="1.7" fill="currentColor" stroke="none" />
        <path strokeWidth="2.2" d="M24 23.2V13" />
        <path
          strokeWidth="2"
          fill="currentColor"
          fillOpacity="0.28"
          d="M24 16.5C19.8 16.6 16.6 14 16 10C20.2 9.8 23.4 12.4 24 16.5Z"
        />
        <path
          strokeWidth="2"
          fill="currentColor"
          fillOpacity="0.28"
          d="M24 13.8C24.8 9.6 28.2 6.8 32.4 7C31.9 11.2 28.6 13.9 24 13.8Z"
        />
      </g>
    </svg>
  )
}

// 「月度冠军」: a laurel wreath, two branches tied at the bottom with a pair of berries where they
// meet. The inner leaves set the rhythm, as close as they go without touching; the outer ones sit
// in the gaps between them.
const LAUREL_STEMS = [
  'M18.9 35.5A13.5 13.5 0 0 1 16.5 11.8',
  'M29.1 35.5A13.5 13.5 0 0 0 31.5 11.8',
]
// Each leaf: centre x, centre y, angle.
const LAUREL_LEAVES: [number, number, number][] = [
  [15.8, 30.3, -94.0],
  [13.5, 26.2, -69.0],
  [13.1, 21.4, -44.0],
  [14.8, 17.0, -19.0],
  [10.4, 31.0, -165.5],
  [8.3, 24.5, -140.5],
  [9.1, 17.8, -115.5],
  [12.7, 11.9, -90.5],
  [19.4, 9.8, -34.0],
  [32.2, 30.3, 274.0],
  [34.5, 26.2, 249.0],
  [34.9, 21.4, 224.0],
  [33.2, 17.0, 199.0],
  [37.6, 31.0, 345.5],
  [39.7, 24.5, 320.5],
  [38.9, 17.8, 295.5],
  [35.3, 11.9, 270.5],
  [28.6, 9.8, 214.0],
]
const LAUREL_BERRIES: [number, number][] = [
  [22.2, 35.3],
  [25.8, 35.3],
]

export function LaurelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {LAUREL_STEMS.map((d) => (
          <path key={d} d={d} strokeWidth="2" />
        ))}
        {LAUREL_LEAVES.map(([x, y, a]) => (
          <ellipse
            key={`${x},${y}`}
            cx={x}
            cy={y}
            rx="3.4"
            ry="1.55"
            transform={`rotate(${a} ${x} ${y})`}
            fill="currentColor"
            stroke="none"
          />
        ))}
        <path
          strokeWidth="2"
          d="M18.9 35.5Q24 40.5 29.1 35.5M21.5 38.6L19.5 42.5M26.5 38.6L28.5 42.5"
        />
        {LAUREL_BERRIES.map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r="1.5" fill="currentColor" stroke="none" />
        ))}
      </g>
    </svg>
  )
}

// 「史上最强」: a crown with a gem, three points topped with pearls.
export function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          strokeWidth="2.4"
          fill="currentColor"
          fillOpacity="0.28"
          d="M10.5 33.5L7.5 16.5L17 24.5L24 11.5L31 24.5L40.5 16.5L37.5 33.5Z"
        />
        <path strokeWidth="2.4" d="M10 38.5H38" />
        <circle cx="7.5" cy="14.8" r="2.1" fill="currentColor" stroke="none" />
        <circle cx="24" cy="9.6" r="2.3" fill="currentColor" stroke="none" />
        <circle cx="40.5" cy="14.8" r="2.1" fill="currentColor" stroke="none" />
        <path fill="currentColor" stroke="none" d="M24 23.5L26.6 27.5L24 31.5L21.4 27.5Z" />
      </g>
    </svg>
  )
}

// 「现代最强」: the dome crown to 「史上最强」's pointed one, after the Imperial State Crown — arches
// set with pearls dipping under an orb and cross, a cross pattée on the jewelled band, an ermine rim.
export function DomeCrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          strokeWidth="2.4"
          fill="currentColor"
          fillOpacity="0.28"
          d="M11.5 27C11 20 13.6 14.7 18 14.1C21 13.7 23 15.1 24 16.9C25 15.1 27 13.7 30 14.1C34.4 14.7 37 20 36.5 27Z"
        />
        {/* pearls along the arches */}
        <path strokeWidth="2" strokeDasharray="0 3.6" d="M15.6 25.2C15.7 21 16.9 18.2 19.3 17" />
        <path strokeWidth="2" strokeDasharray="0 3.6" d="M32.4 25.2C32.3 21 31.1 18.2 28.7 17" />
        <path strokeWidth="2" d="M24 16.9V20.5" />
        <path
          fill="currentColor"
          stroke="none"
          d="M23.25 22.15L22.5 20H25.5L24.75 22.15L26.9 21.4V24.4L24.75 23.65L25.5 25.8H22.5L23.25 23.65L21.1 24.4V21.4Z"
        />
        <path
          strokeWidth="2.4"
          fill="currentColor"
          fillOpacity="0.28"
          d="M10.5 27H37.5L36.8 32.4H11.2Z"
        />
        <ellipse cx="24" cy="29.7" rx="2.1" ry="1.6" fill="currentColor" stroke="none" />
        <circle cx="16.8" cy="29.7" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="31.2" cy="29.7" r="1.2" fill="currentColor" stroke="none" />
        {/* ermine */}
        <rect
          x="9.5"
          y="34"
          width="29"
          height="4.8"
          rx="2.4"
          strokeWidth="2.4"
          fill="currentColor"
          fillOpacity="0.28"
        />
        <path
          fill="currentColor"
          stroke="none"
          d="M16 35.3L16.9 37.5H15.1Z M24 35.3L24.9 37.5H23.1Z M32 35.3L32.9 37.5H31.1Z"
        />
        <circle cx="24" cy="12.4" r="2.5" fill="currentColor" stroke="none" />
        <path strokeWidth="2" d="M24 9.8V4.8M21.6 7.2H26.4" />
      </g>
    </svg>
  )
}

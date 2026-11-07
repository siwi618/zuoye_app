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

// 「月度冠军」: a laurel wreath, two leafy branches tied at the bottom.
const LAUREL_STEMS = [
  'M18.9 35.5A13.5 13.5 0 0 1 16.5 11.8',
  'M29.1 35.5A13.5 13.5 0 0 0 31.5 11.8',
]
// Each leaf: centre x, centre y, angle.
const LAUREL_LEAVES: [number, number, number][] = [
  [14.5, 36, -176],
  [17.2, 31.6, -120],
  [10.4, 31.7, -155],
  [14.6, 28.6, -99],
  [8.2, 26.3, -134],
  [13.2, 24.9, -78],
  [8.1, 20.4, -113],
  [13.2, 20.9, -57],
  [10.1, 14.9, -92],
  [14.7, 17.1, -36],
  [13.9, 10.4, -71],
  [17.4, 14.2, -15],
  [18.6, 10.4, -34],
  [33.5, 36, 356],
  [30.8, 31.6, 300],
  [37.6, 31.7, 335],
  [33.4, 28.6, 279],
  [39.8, 26.3, 314],
  [34.8, 24.9, 258],
  [39.9, 20.4, 293],
  [34.8, 20.9, 237],
  [37.9, 14.9, 272],
  [33.3, 17.1, 216],
  [34.1, 10.4, 251],
  [30.6, 14.2, 195],
  [29.4, 10.4, 214],
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
            ry="1.5"
            transform={`rotate(${a} ${x} ${y})`}
            fill="currentColor"
            stroke="none"
          />
        ))}
        <path
          strokeWidth="2"
          d="M18.9 35.5Q24 40.5 29.1 35.5M21.5 38.6L19.5 42.5M26.5 38.6L28.5 42.5"
        />
      </g>
    </svg>
  )
}

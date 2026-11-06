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

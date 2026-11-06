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

// 「雷蜂」: a honeycomb of five hexagons sharing their walls (two above, one in the middle, two
// below) with a lightning bolt in the middle cell. Every stage (雷蜂 → 靁蜂 → 靐蜂 → 䨻蜂) uses
// it; the medal's colour shows the stage.
const COMB = [
  'M16.9 3.5L24 7.6L24 15.8L16.9 19.9L9.8 15.8L9.8 7.6Z',
  'M31.1 3.5L38.2 7.6L38.2 15.8L31.1 19.9L24 15.8L24 7.6Z',
  'M16.9 28.1L24 32.2L24 40.4L16.9 44.5L9.8 40.4L9.8 32.2Z',
  'M31.1 28.1L38.2 32.2L38.2 40.4L31.1 44.5L24 40.4L24 32.2Z',
]
const MIDDLE = 'M24 15.8L31.1 19.9L31.1 28.1L24 32.2L16.9 28.1L16.9 19.9Z'

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

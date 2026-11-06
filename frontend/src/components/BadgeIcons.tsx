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

// 「雷蜂」: a line-drawn bee seen from above with a lightning bolt down its body. Every stage
// (雷蜂 → 靁蜂 → 靐蜂 → 䨻蜂) uses it; the medal's colour shows the stage.
export function BeeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <ellipse
          cx="13.5"
          cy="18"
          rx="7.5"
          ry="4.6"
          transform="rotate(-32 13.5 18)"
          fill="currentColor"
          fillOpacity="0.28"
          strokeWidth="2"
        />
        <ellipse
          cx="34.5"
          cy="18"
          rx="7.5"
          ry="4.6"
          transform="rotate(32 34.5 18)"
          fill="currentColor"
          fillOpacity="0.28"
          strokeWidth="2"
        />
        <circle cx="24" cy="12.6" r="4" strokeWidth="2.4" />
        <path
          strokeWidth="2"
          d="M22.2 9.3C21.4 6.6 19.8 5 17.4 4.6M25.8 9.3C26.6 6.6 28.2 5 30.6 4.6"
        />
        <ellipse cx="24" cy="29.6" rx="8.4" ry="11" strokeWidth="2.4" />
        <path strokeWidth="2.2" d="M24 40.6V44" />
        <path
          d="M25.9 20.6L19.6 30.2H24.1L21.9 38.6L28.5 27.8H24Z"
          fill="currentColor"
          stroke="none"
        />
      </g>
    </svg>
  )
}

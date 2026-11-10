import { useSyncExternalStore } from 'react'

// Whether a CSS media query matches now, updating when it changes (e.g. the window is resized
// across a breakpoint).
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

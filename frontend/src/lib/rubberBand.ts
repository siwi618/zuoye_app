import { useEffect, type RefObject } from 'react'

const MAX = 72 // the furthest the box gives, in px
const SETTLE = 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)' // springs back, a touch past
// A wheel pull lets go when the wheel pauses or after HOLD at most (about 0.5 s with the spring),
// then ignores the rest of that push (a trackpad keeps coasting, each step weaker than the last)
// until a stronger step says a new swipe has begun, or the wheel goes quiet for COAST.
const WHEEL_IDLE = 50
const HOLD = 200
const COAST = 150
const NEW_SWIPE = 1.5 // a step this much stronger than the last starts a new swipe

// A scroll box pushed past its top or bottom (wheel, trackpad or finger) gives a little, harder
// the further it goes, then springs back when let go. The whole box moves, not its content
// (moving the content would change how far it can scroll), so its parent must clip it.
export function useRubberBand(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let pull = 0 // how far past an end it has been pushed: + past the top, - past the bottom
    let timer = 0
    let since = 0 // when the current wheel pull began
    let coasting = false
    let quiet = 0
    let lastStep = 0
    let touchY: number | null = null

    const atTop = () => el.scrollTop <= 0
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    // Where the box is now, maybe halfway through springing back.
    const offset = () => {
      const m = getComputedStyle(el).transform
      return m === 'none' ? 0 : new DOMMatrix(m).m42
    }
    const draw = () => {
      const give = MAX * (1 - Math.exp(-Math.abs(pull) / (MAX * 2)))
      el.style.transition = 'none'
      el.style.transform = pull ? `translateY(${Math.sign(pull) * give}px)` : ''
    }
    const release = () => {
      window.clearTimeout(timer)
      touchY = null
      since = 0
      if (!pull) return
      pull = 0
      el.style.transition = SETTLE
      el.style.transform = ''
    }
    // A push of dy (positive = scrolling down); true if it went into the pull instead.
    const push = (dy: number) => {
      let dir = Math.sign(pull) // +1 past the top, -1 past the bottom
      if (!dir) {
        dir = dy < 0 && atTop() ? 1 : dy > 0 && atBottom() ? -1 : 0
        if (!dir) return false
        // Pushed again while still springing back: carry on from where the box is.
        const now = offset()
        if (Math.sign(now) === dir)
          pull = dir * -2 * MAX * Math.log(1 - Math.min(Math.abs(now) / MAX, 0.95))
      }
      pull = dir > 0 ? Math.max(0, pull - dy) : Math.min(0, pull - dy)
      draw()
      return true
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return // zoom, sideways
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.4
      window.clearTimeout(quiet)
      quiet = window.setTimeout(() => (coasting = false), COAST)
      const step = Math.abs(dy)
      if (coasting && step > Math.max(lastStep * NEW_SWIPE, 2)) coasting = false
      lastStep = step
      if (coasting) {
        // The same push still coming in: no second pull, and no browser bounce on top.
        if ((dy < 0 && atTop()) || (dy > 0 && atBottom())) e.preventDefault()
        return
      }
      if (!push(dy)) return
      e.preventDefault()
      since ||= e.timeStamp
      window.clearTimeout(timer)
      if (e.timeStamp - since >= HOLD) letGo()
      else timer = window.setTimeout(letGo, WHEEL_IDLE)
    }
    const letGo = () => {
      release()
      coasting = true
    }
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (touchY === null || y === undefined) return
      const dy = touchY - y
      touchY = y
      if (push(dy) && e.cancelable) e.preventDefault()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', release)
    el.addEventListener('touchcancel', release)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(quiet)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', release)
      el.removeEventListener('touchcancel', release)
      el.style.transition = ''
      el.style.transform = ''
    }
  }, [ref])
}

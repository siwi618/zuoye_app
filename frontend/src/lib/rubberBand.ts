import { useEffect, type RefObject } from 'react'

const MAX = 72 // the furthest the box gives, in px
const SETTLE = 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)' // springs back, a touch past
const WHEEL_IDLE = 140 // ms without a wheel event before the box lets go

// A scroll box pushed past its top or bottom (wheel, trackpad or finger) gives a little, harder
// the further it goes, then springs back when let go. The whole box moves, not its content
// (moving the content would change how far it can scroll), so its parent must clip it.
export function useRubberBand(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let pull = 0 // how far past an end it has been pushed: + past the top, - past the bottom
    let timer = 0
    let touchY: number | null = null

    const atTop = () => el.scrollTop <= 0
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    const draw = () => {
      const give = MAX * (1 - Math.exp(-Math.abs(pull) / (MAX * 2)))
      el.style.transition = 'none'
      el.style.transform = pull ? `translateY(${Math.sign(pull) * give}px)` : ''
    }
    const release = () => {
      window.clearTimeout(timer)
      touchY = null
      if (!pull) return
      pull = 0
      el.style.transition = SETTLE
      el.style.transform = ''
    }
    // A push of dy (positive = scrolling down); true if it went into the pull instead.
    const push = (dy: number) => {
      if (pull > 0 || (!pull && dy < 0 && atTop())) pull = Math.max(0, pull - dy)
      else if (pull < 0 || (!pull && dy > 0 && atBottom())) pull = Math.min(0, pull - dy)
      else return false
      draw()
      return true
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return // zoom, sideways
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.4
      if (!push(dy)) return
      e.preventDefault()
      window.clearTimeout(timer)
      timer = window.setTimeout(release, WHEEL_IDLE)
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

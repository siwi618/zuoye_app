import { useEffect, useRef, type RefObject } from 'react'

// Fish cruise across the scene and scatter from the pointer. Pressing on a fish catches it: it
// hangs from the pointer, thrashing to get free, until the button (or finger) lets go and it dashes
// off. Positions are written straight to the DOM each frame, so React never re-renders for them.
// Reduced motion: placed once, no loop, nothing to catch.

const FISH = [
  { y: 0.16, size: 1, speed: 46, dir: 1 },
  { y: 0.22, size: 0.7, speed: 58, dir: 1 },
  { y: 0.27, size: 0.8, speed: 52, dir: 1 },
  { y: 0.34, size: 1.15, speed: 38, dir: -1 },
  { y: 0.4, size: 0.65, speed: 64, dir: -1 },
  { y: 0.12, size: 0.6, speed: 70, dir: -1 },
  { y: 0.46, size: 0.9, speed: 42, dir: 1 },
]

export const FISH_COUNT = FISH.length

const FLEE_RADIUS = 150
// Top speed, px/s. Low enough that a steady hand can chase a fish down and catch it.
const MAX_SPEED = 240
// A fish is 40 x 20 px before its size scale; this much reach around its centre counts as a catch.
const HALF_W = 20
const HALF_H = 10
const reach = (size: number) => HALF_W * size + 20
// Things that keep their own click: tool tips, buttons and the detail panel.
const OWN_CLICK = 'a, button, .tbx-grow__panel'

export function useFish(sceneRef: RefObject<HTMLElement | null>, still: boolean) {
  const fishRefs = useRef<(HTMLDivElement | null)[]>([])
  const pointer = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const w0 = scene.clientWidth
    const h0 = scene.clientHeight
    const fish = FISH.map((f, i) => ({
      ...f,
      x: ((i * 0.37 + 0.1) % 1) * w0,
      y0: f.y * h0,
      y: f.y * h0,
      vx: f.speed * f.dir,
      vy: 0,
      phase: i * 1.7,
      twist: 0,
    }))

    // The caught fish, when and where it was caught, and when it next flips round to pull the other way.
    let caught: { i: number; since: number; flipAt: number; pointerId: number } | null = null
    let overOwnClick = false

    const place = () => {
      fish.forEach((f, i) => {
        const el = fishRefs.current[i]
        if (!el) return
        const flip = f.size * (caught?.i === i ? -f.dir : f.vx > 0 ? -1 : 1)
        el.style.transform = `translate(${f.x}px, ${f.y}px) rotate(${f.twist.toFixed(1)}deg) scale(${flip}, ${f.size})`
      })
    }
    place()
    if (still) return

    const local = (e: PointerEvent) => {
      const r = scene.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    // The fish whose body is nearest the point, if the point is within reach of it.
    const fishAt = (p: { x: number; y: number }) => {
      let best = -1
      let bestD = Infinity
      fish.forEach((f, i) => {
        const d = Math.hypot(f.x + HALF_W - p.x, f.y + HALF_H - p.y)
        if (d < reach(f.size) && d < bestD) {
          best = i
          bestD = d
        }
      })
      return best
    }

    const onMove = (e: PointerEvent) => {
      pointer.current = local(e)
      overOwnClick = !!(e.target as Element | null)?.closest?.(OWN_CLICK)
    }
    const onLeave = () => {
      if (!caught) pointer.current = null
    }
    const onDown = (e: PointerEvent) => {
      if (caught || (e.pointerType === 'mouse' && e.button !== 0)) return
      if ((e.target as Element | null)?.closest?.(OWN_CLICK)) return
      const p = local(e)
      const i = fishAt(p)
      if (i < 0) return
      e.preventDefault()
      pointer.current = p
      const now = performance.now() / 1000
      caught = { i, since: now, flipAt: now + 0.5 + Math.random() * 0.6, pointerId: e.pointerId }
      scene.setPointerCapture?.(e.pointerId)
      scene.classList.add('is-catching')
      fishRefs.current[i]?.classList.add('is-caught')
    }
    const onUp = (e: PointerEvent) => {
      if (!caught || e.pointerId !== caught.pointerId) return
      const f = fish[caught.i]
      // Let go: it bolts the way it was pulling, then settles back into cruising.
      f.vx = f.dir * MAX_SPEED
      f.vy = (Math.random() - 0.5) * 160
      fishRefs.current[caught.i]?.classList.remove('is-caught')
      scene.classList.remove('is-catching')
      if (scene.hasPointerCapture?.(e.pointerId)) scene.releasePointerCapture(e.pointerId)
      caught = null
      if (e.pointerType !== 'mouse') pointer.current = null
    }
    // While a finger holds a fish, the page must not scroll under it.
    const onTouchMove = (e: TouchEvent) => {
      if (caught) e.preventDefault()
    }
    scene.addEventListener('pointermove', onMove)
    scene.addEventListener('pointerleave', onLeave)
    scene.addEventListener('pointerdown', onDown)
    scene.addEventListener('pointerup', onUp)
    scene.addEventListener('pointercancel', onUp)
    scene.addEventListener('touchmove', onTouchMove, { passive: false })

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const w = scene.clientWidth
      const h = scene.clientHeight
      const t = now / 1000
      const p = pointer.current
      fish.forEach((f, i) => {
        if (caught?.i !== i || !p) return
        // Held by the middle, kept inside the water, tugging a few px the way it faces.
        if (t > caught.flipAt) {
          f.dir = -f.dir
          caught.flipAt = t + 0.45 + Math.random() * 0.7
        }
        const tug = (Math.sin((t - caught.since) * 23) + 1) * 3 * f.dir
        const tx = Math.min(Math.max(p.x - HALF_W + tug, 0), w - HALF_W * 2)
        const ty = Math.min(Math.max(p.y - HALF_H, 0), h - HALF_H * 2)
        const k = Math.min(1, dt * 28)
        f.x += (tx - f.x) * k
        f.y += (ty - f.y) * k
        f.vx = 0
        f.vy = 0
      })
      // A caught fish twists about its middle, two wobbles out of step so it never looks regular;
      // once let go the twist eases back to level instead of snapping.
      fish.forEach((f, i) => {
        if (caught?.i === i) {
          const s = t - caught.since
          f.twist = Math.sin(s * 17) * 20 + Math.sin(s * 7.3 + 1) * 9
        } else if (f.twist !== 0) {
          f.twist = Math.abs(f.twist) < 0.2 ? 0 : f.twist * Math.exp(-dt * 10)
        }
      })
      // Pressing here would catch something: say so with the cursor.
      scene.classList.toggle('is-fishy', !caught && !!p && !overOwnClick && fishAt(p) >= 0)
      for (const [i, f] of fish.entries()) {
        if (caught?.i === i) continue
        const wantVx = f.speed * f.dir
        const wantVy = Math.sin(t * 0.9 + f.phase) * 14 + (f.y0 - f.y) * 0.6
        let ax = (wantVx - f.vx) * 1.4
        let ay = (wantVy - f.vy) * 1.4
        if (p) {
          const dx = f.x - p.x
          const dy = f.y - p.y
          const d = Math.hypot(dx, dy) || 1
          if (d < FLEE_RADIUS) {
            const push = ((FLEE_RADIUS - d) / FLEE_RADIUS) * 2600
            ax += (dx / d) * push
            ay += (dy / d) * push
          }
        }
        f.vx += ax * dt
        f.vy += ay * dt
        const sp = Math.hypot(f.vx, f.vy)
        if (sp > MAX_SPEED) {
          f.vx *= MAX_SPEED / sp
          f.vy *= MAX_SPEED / sp
        }
        // A fish chased hard enough turns and keeps going the new way.
        if (Math.sign(f.vx) !== f.dir && Math.abs(f.vx) > f.speed * 1.5) f.dir = Math.sign(f.vx)
        f.x += f.vx * dt
        f.y += f.vy * dt
        if (f.x > w + 40) f.x = -40
        if (f.x < -40) f.x = w + 40
      }
      place()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      scene.removeEventListener('pointermove', onMove)
      scene.removeEventListener('pointerleave', onLeave)
      scene.removeEventListener('pointerdown', onDown)
      scene.removeEventListener('pointerup', onUp)
      scene.removeEventListener('pointercancel', onUp)
      scene.removeEventListener('touchmove', onTouchMove)
      scene.classList.remove('is-catching', 'is-fishy')
    }
  }, [sceneRef, still])

  return fishRefs
}

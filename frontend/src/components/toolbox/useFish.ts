import { useEffect, useRef, type RefObject } from 'react'

// Fish cruise across the scene and scatter from the pointer. Positions are written straight to
// the DOM each frame, so React never re-renders for them. Reduced motion: placed once, no loop.

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
    }))

    const place = () => {
      fish.forEach((f, i) => {
        const el = fishRefs.current[i]
        if (el) el.style.transform = `translate(${f.x}px, ${f.y}px) scale(${f.size * (f.vx > 0 ? -1 : 1)}, ${f.size})`
      })
    }
    place()
    if (still) return

    const onMove = (e: PointerEvent) => {
      const r = scene.getBoundingClientRect()
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onLeave = () => {
      pointer.current = null
    }
    scene.addEventListener('pointermove', onMove)
    scene.addEventListener('pointerleave', onLeave)

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const w = scene.clientWidth
      const t = now / 1000
      for (const f of fish) {
        const wantVx = f.speed * f.dir
        const wantVy = Math.sin(t * 0.9 + f.phase) * 14 + (f.y0 - f.y) * 0.6
        let ax = (wantVx - f.vx) * 1.4
        let ay = (wantVy - f.vy) * 1.4
        const p = pointer.current
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
        if (sp > 320) {
          f.vx *= 320 / sp
          f.vy *= 320 / sp
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
    }
  }, [sceneRef, still])

  return fishRefs
}

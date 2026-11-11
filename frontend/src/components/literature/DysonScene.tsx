import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { Work } from '@/lib/literature/corpus'
import {
  type Mat3,
  type Projected,
  type Vec3,
  apply,
  aroundX,
  aroundY,
  axisAngle,
  icosphere,
  mul,
  orthonormalize,
  project,
  snapToVertices,
  spherePoints,
  towardViewer,
} from '@/lib/literature/sphere'

export interface Selection {
  kind: 'device' | 'work'
  key: string
}

// A request to turn the scene so a node faces the viewer; `nonce` repeats the same request.
export interface Focus extends Selection {
  nonce: number
}

const FOCUS_MS = 700
// Zooming into a node: the camera flies into the sphere, the node settles in the middle and its
// related nodes form a ring around it (a local graph, like Obsidian's), everything else drifts
// out of view.
const ZOOM_MS = 850
const RING_R = 0.62
const ZOOM_SCALE = { centre: 1.7, ring: 1.15 }
// Moving the centre of the local graph to one of its neighbours.
const SHIFT_MS = 700
const easeInOut = (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2)

// Where a node is drawn in the local graph and how present it is (1 = shown, 0 = gone).
interface Placed {
  x: number
  y: number
  scale: number
  vis: number
}

const CORE_R = 0.2
const SHELL_R = 0.8
const SPIN = 0.12 // rad/s when idle
// Starting orientation: turned a little sideways and tipped slightly towards the viewer.
const INITIAL_VIEW: Mat3 = mul(aroundX(-0.28), aroundY(0.4))
const DRAG_PX = 4 // movement that turns a press into a drag
// Opening: like a globe set spinning, the sphere grows from small to full size while it turns an
// extra half turn that slows into the idle spin. The text is left out until it has grown (a size
// that changes every frame makes the browser re-shape the CJK labels; see TEXT_STEP_PX), then fades in.
const INTRO_MS = 1300
const INTRO_FROM = 0.12
const INTRO_TURN = Math.PI
const easeOut = (k: number) => 1 - (1 - k) ** 3
// A computer is too slow to animate the scene when animating it takes more than this share of the
// main thread for two half seconds running (one alone can be the labels appearing); then the
// opening is cut short and the idle spin stays off (dragging still turns it).
const SLOW_LOAD = 0.5
const LOAD_WINDOW_MS = 500
const SLOW_WINDOWS = 2

// Measures how much of the main thread animating the scene takes. Each sample runs from a frame's
// callback to a task queued just after React's own for it (React schedules its render from a
// microtask, so ours is queued from one too): React's render and commit, plus the browser's style,
// layout and paint of the frame before. `onSlow` is called once the load proves too heavy.
function frameMeter(onSlow: () => void) {
  const ch = new MessageChannel()
  let start = 0
  let prev = 0
  let busy = 0
  let span = 0
  let heavy = 0 // heavy windows in a row
  ch.port1.onmessage = () => (busy += performance.now() - start)
  return {
    // Call in a frame's callback, after changing the state that redraws the scene.
    sample() {
      const now = performance.now()
      // A pause (the tab hidden, a skipped frame) starts a fresh window.
      if (prev && now - prev < 1000) span += now - prev
      else busy = span = 0
      prev = start = now
      queueMicrotask(() => ch.port2.postMessage(0))
      if (span >= LOAD_WINDOW_MS) {
        heavy = busy / span > SLOW_LOAD ? heavy + 1 : 0
        if (heavy === SLOW_WINDOWS) onSlow()
        busy = span = 0
      }
    },
    // The scene was not animated this frame: the next sample starts a fresh window.
    skip() {
      prev = 0
    },
    stop() {
      ch.port1.close()
    },
  }
}
const VIEW_W = 2.4 // viewBox width in scene units
// Mesh line opacity: faint by default, brighter on the layer whose node is under the pointer.
const MESH = {
  shellFront: { idle: 0.1, lit: 0.34 },
  shellBack: { idle: 0.03, lit: 0.1 },
  coreEdge: { idle: 0.25, lit: 0.85 },
  coreBack: { idle: 0.06, lit: 0.22 },
}
const fade = { transition: 'stroke-opacity 300ms ease' }
// Sphere radius per node kind, before perspective scale.
const NODE_R = { work: 0.062, device: 0.03 }
// Labels never shrink below these pixel sizes on narrow screens.
const MIN_LABEL_PX = { work: 12, device: 11 }
// Text sizes snap to whole steps of this many screen pixels. A font size that changes every frame
// makes the browser re-shape the text (and search the font fallback list for the CJK glyphs) on
// every frame of the spin; that took most of the main thread and made scrolling stutter. Scaling
// with a transform does not help: Chrome folds the scale into the font size it lays out.
const TEXT_STEP_PX = 0.5
const snapText = (size: number, ppu: number) =>
  Math.round((size * ppu) / TEXT_STEP_PX) * (TEXT_STEP_PX / ppu)

interface Node {
  kind: Selection['kind']
  key: string
  label: string
  initial?: string // works: first character of the title, drawn on the sphere
  base: Vec3
}

// Core: a coarser polyhedron so its facets read; shell: finer, close to a sphere.
const CORE_MESH = icosphere(1)
const SHELL_MESH = icosphere(2)
const LIGHT: Vec3 = (() => {
  const v: Vec3 = [-0.45, 0.6, 0.66]
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
})()

// A device on the core (a #tag students use) and a work–device link.
export interface CoreDevice {
  key: string
  label: string
}
export interface Link {
  work: string
  device: string
}

interface Graph {
  nodes: Node[]
  edges: Link[]
}

// Nodes are spread evenly, then moved onto the nearest polyhedron vertex.
function buildGraph(works: Work[], devices: CoreDevice[], edges: Link[]): Graph {
  const core = snapToVertices(spherePoints(devices.length, CORE_R, 0.7), CORE_MESH)
  const shell = snapToVertices(spherePoints(works.length, SHELL_R), SHELL_MESH)
  return {
    nodes: [
      ...core.map((base, i) => ({
        kind: 'device' as const,
        key: devices[i].key,
        label: devices[i].label,
        base,
      })),
      ...shell.map((base, i) => ({
        kind: 'work' as const,
        key: works[i].key,
        label: `《${works[i].title}》`,
        initial: [...works[i].title][0],
        base,
      })),
    ],
    edges,
  }
}

// Works published together (阿城「三王」) are joined by a faint dashed line on the shell.
const groupLinks = (works: Work[]) =>
  works.flatMap((w, i) => {
    const next = works.slice(i + 1).find((x) => x.group && x.group === w.group)
    return next ? [[w.key, next.key] as const] : []
  })

const id = (kind: string, key: string) => `${kind}:${key}`

// A projected mesh's wireframe, split into edges in front of / behind the centre plane.
function meshEdges(points: Projected[], edges: [number, number][]) {
  let front = ''
  let back = ''
  for (const [a, b] of edges) {
    const [p, q] = [points[a], points[b]]
    const seg = `M${p.x.toFixed(4)} ${p.y.toFixed(4)}L${q.x.toFixed(4)} ${q.y.toFixed(4)}`
    if (p.z + q.z >= 0) front += seg
    else back += seg
  }
  return { front, back }
}

// Orientation that brings point b (as placed by `from`) to the front centre, turning the
// shortest way.
function facing(b: Vec3, from: Mat3): Mat3 {
  const { axis, angle } = towardViewer(apply(from, b))
  return mul(axisAngle(axis, angle), from)
}

// Nodes directly linked to node `k` (works ↔ devices).
function neighbours(g: Graph, k: string): string[] {
  const out: string[] = []
  for (const e of g.edges) {
    if (k === id('work', e.work)) out.push(id('device', e.device))
    if (k === id('device', e.device)) out.push(id('work', e.work))
  }
  return out
}

// Ring slot (angle) for every neighbour of `k`, in the order they appear around `k` once the
// scene has turned `k` to the front, so nodes glide out to the ring without crossing.
function ringAngles(g: Graph, k: string, from: Mat3): Map<string, number> {
  const node = g.nodes.find((n) => id(n.kind, n.key) === k)!
  const view = facing(node.base, from)
  const at = (key: string) => {
    const n = g.nodes.find((x) => id(x.kind, x.key) === key)!
    return project(apply(view, n.base))
  }
  const c = at(k)
  const around = neighbours(g, k)
    .map((key) => {
      const p = at(key)
      return { key, a: Math.atan2(p.y - c.y, p.x - c.x) }
    })
    .sort((a, b) => a.a - b.a)
  const step = (2 * Math.PI) / Math.max(around.length, 1)
  return new Map(around.map((o, i) => [o.key, (around[0]?.a ?? 0) + i * step]))
}

// Label font size: grows with perspective, a little more once zoomed in (zt), never below the
// minimum pixel size.
function labelFont(kind: Selection['kind'], scale: number, zt: number, ppu: number) {
  return Math.max(
    (kind === 'work' ? 0.068 : 0.046) * Math.min(scale, 1.15 + 0.45 * zt),
    MIN_LABEL_PX[kind] / ppu,
  )
}

// Ring radius for a local graph: as large as RING_R, but small enough that every label on the
// ring stays inside the scene horizontally (on a phone the labels are relatively wider).
function ringRadius(g: Graph, ring: Map<string, number>, ppu: number) {
  let r = RING_R
  for (const [k, a] of ring) {
    const n = g.nodes.find((x) => id(x.kind, x.key) === k)
    if (!n) continue
    const scale = ZOOM_SCALE.ring
    const font = labelFont(n.kind, scale, 1, ppu)
    const room = VIEW_W / 2 - 0.04 - (NODE_R[n.kind] * scale + 0.03) - labelWidth(n.label, font)
    const c = Math.abs(Math.cos(a))
    if (c > 0.2) r = Math.min(r, room / c)
  }
  return Math.max(r, 0.36)
}

// Turns the whole ring (keeping the nodes' order and even spacing) to the angle that leaves the
// most room: the largest radius, and no node level with the centre, where the centre's label
// sits. With `anchor` (a centre move), it also prefers putting that node near the given angle.
function placeRing(
  g: Graph,
  ring: Map<string, number>,
  ppu: number,
  anchor?: { key: string; angle: number },
) {
  const keys = [...ring.keys()]
  if (keys.length === 0) return ring
  const step = (2 * Math.PI) / keys.length
  const first = ring.get(keys[0])!
  let best = ring
  let bestScore = -Infinity
  // Whole turns, not just one slot's width: the anchored node must be able to reach any angle.
  for (let j = 0; j < 48; j++) {
    const turn = (j / 48) * 2 * Math.PI
    const candidate = new Map(keys.map((k, i) => [k, first + turn + i * step]))
    const level = Math.min(...[...candidate.values()].map((a) => Math.abs(Math.sin(a))))
    let score = ringRadius(g, candidate, ppu) * (0.55 + 0.45 * Math.min(level * 2, 1))
    if (anchor && candidate.has(anchor.key)) {
      const d = Math.abs(
        Math.atan2(
          Math.sin(candidate.get(anchor.key)! - anchor.angle),
          Math.cos(candidate.get(anchor.key)! - anchor.angle),
        ),
      )
      score -= 0.5 * (d / Math.PI)
    }
    if (score > bestScore) [best, bestScore] = [candidate, score]
  }
  return best
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Estimated label width: CJK glyphs and book-title marks are one em, spaces and slashes about
// 0.3 em (measured with getBBox in the page's font).
function labelWidth(label: string, fontSize: number) {
  let em = 0
  for (const ch of label) em += ' /'.includes(ch) ? 0.3 : 1
  return em * fontSize
}

export function DysonScene({
  works,
  devices,
  links,
  selected,
  onPick,
  focus,
  zoom,
}: {
  works: Work[]
  devices: CoreDevice[]
  links: Link[]
  selected: Selection | null
  // `clicks`: 1 = single click, 2 = second click of a double click, 0 = keyboard.
  onPick: (s: Selection, clicks: number) => void
  focus?: Focus | null
  zoom?: Selection | null // node to zoom into; null = the whole sphere
}) {
  const { t } = useTranslation()
  const svg = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<Mat3>(INITIAL_VIEW)
  // Opening progress 0 → 1; with reduced motion the sphere is simply there.
  const [intro, setIntro] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0,
  )
  const introSkip = useRef(false)
  // Set once the computer has proved too slow to animate the scene (see SLOW_LOAD).
  const slow = useRef(false)
  const [still, setStill] = useState(false)
  const tooSlow = () => {
    slow.current = true
    introSkip.current = true
    setStill(true)
  }
  // The text fades in once, as the opening ends; after that the fade is dropped. A node is
  // remounted whenever it passes between the far and near side, and a fade on every remount
  // makes its label flash as the sphere turns.
  const [textFade, setTextFade] = useState(intro < 1)
  const textFading = useRef(textFade)
  useEffect(() => {
    textFading.current = textFade
  }, [textFade])
  useEffect(() => {
    if (intro >= 1) return
    // Time is added frame by frame with each step capped, so the busy first frames while the page
    // is still mounting slow the opening down instead of skipping most of it.
    let frame = 0
    let fadeTimer = 0
    let last = 0
    let elapsed = 0
    let frames = 0
    const meter = frameMeter(tooSlow)
    const step = (now: number) => {
      elapsed += last ? Math.min(now - last, 40) : 0
      last = now
      const k = introSkip.current ? 1 : Math.min(1, elapsed / INTRO_MS)
      setIntro(k)
      // The first frames also carry the page mounting: not counted.
      if (++frames > 3) meter.sample()
      if (k < 1) frame = requestAnimationFrame(step)
      else fadeTimer = window.setTimeout(() => setTextFade(false), 600)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(fadeTimer)
      meter.stop()
    }
    // Runs once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [hover, setHover] = useState<string | null>(null)
  // x/y: where the press started; lastX/lastY: the previous move, for incremental turns.
  const drag = useRef<{
    x: number
    y: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  // Pixels per scene unit, for the minimum label size.
  const [ppu, setPpu] = useState(300)
  const ppuNow = useRef(ppu)
  useEffect(() => {
    ppuNow.current = ppu
  }, [ppu])
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const ro = new ResizeObserver(() => setPpu((el.clientWidth || VIEW_W * 300) / VIEW_W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const paused = useRef(false)
  useEffect(() => {
    paused.current = hover !== null
  }, [hover])
  const viewNow = useRef(view)
  useEffect(() => {
    viewNow.current = view
  }, [view])
  const graph = useMemo(() => buildGraph(works, devices, links), [works, devices, links])
  const grouped = useMemo(() => groupLinks(works), [works])
  const graphNow = useRef(graph)
  useEffect(() => {
    graphNow.current = graph
  }, [graph])
  // After centring a node the idle spin stays off (it would carry the node away) until the
  // visitor drags or clears the selection.
  const held = useRef(false)
  const easing = useRef(false)
  useEffect(() => {
    if (!selected) held.current = false
  }, [selected])

  // Zoom progress 0 (sphere) → 1 (local graph). The last zoomed node is kept while zooming back
  // out so the animation has something to leave from.
  const [zt, setZt] = useState(0)
  const ztNow = useRef(0)
  const [zoomed, setZoomed] = useState<{ k: string; ring: Map<string, number> } | null>(null)
  const zoomedNow = useRef(zoomed)
  // A centre move inside the local graph: every node glides from where it was drawn (`from`) to
  // its place around the new centre; `st` is the progress 0 → 1.
  const [shift, setShift] = useState<{ from: Map<string, Placed>; oldK: string } | null>(null)
  const [st, setSt] = useState(1)
  const placedNow = useRef(new Map<string, Placed>())
  useEffect(() => {
    ztNow.current = zt
    zoomedNow.current = zoomed
  }, [zt, zoomed])
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const run = (ms: number, onStep: (e: number) => void, onEnd?: () => void) => {
      if (reduce) {
        onStep(1)
        onEnd?.()
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const k = Math.min(1, Math.max(0, (now - start) / ms))
        onStep(easeInOut(k))
        if (k < 1) frame = requestAnimationFrame(step)
        else onEnd?.()
      }
      frame = requestAnimationFrame(step)
    }

    const prev = zoomedNow.current
    if (zoom) {
      const k = id(zoom.kind, zoom.key)
      // Already in a local graph: move its centre instead of zooming again.
      if (prev && ztNow.current > 0.99) {
        if (prev.k === k) return
        const theta = prev.ring.get(k)
        // The old centre slides out the way the new one came in: it should land opposite.
        setZoomed({
          k,
          ring: placeRing(
            graphNow.current,
            ringAngles(graphNow.current, k, viewNow.current),
            ppuNow.current,
            theta === undefined ? undefined : { key: prev.k, angle: theta + Math.PI },
          ),
        })
        setShift({ from: new Map(placedNow.current), oldK: prev.k })
        setSt(0)
        run(SHIFT_MS, setSt, () => setShift(null))
        return () => cancelAnimationFrame(frame)
      }
      setZoomed({
        k,
        ring: placeRing(
          graphNow.current,
          ringAngles(graphNow.current, k, viewNow.current),
          ppuNow.current,
        ),
      })
    }
    setShift(null)
    const from = ztNow.current
    const to = zoom ? 1 : 0
    run(ZOOM_MS, (e) => setZt(lerp(from, to, e)))
    return () => cancelAnimationFrame(frame)
  }, [zoom])
  const zooming = zt > 0 && zoomed !== null

  useEffect(() => {
    if (!focus) return
    const node = graphNow.current.nodes.find((n) => n.kind === focus.kind && n.key === focus.key)
    if (!node) return
    const from = viewNow.current
    // One rotation, about a fixed axis, from here to facing the viewer.
    const { axis, angle } = towardViewer(apply(from, node.base))
    held.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setView(mul(axisAngle(axis, angle), from))
      return
    }
    easing.current = true
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      // A drag takes over from the animation.
      if (drag.current?.moved) {
        easing.current = false
        return
      }
      const k = Math.min(1, Math.max(0, (now - start) / FOCUS_MS))
      const e = 1 - (1 - k) ** 3 // ease-out
      setView(mul(axisAngle(axis, angle * e), from))
      if (k < 1) frame = requestAnimationFrame(step)
      else easing.current = false
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      easing.current = false
    }
  }, [focus])

  // Is the scene on screen? Off screen (scrolled away, or the tab hidden) the idle spin stops,
  // so the page does not redraw for nothing.
  const onScreen = useRef(true)
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => (onScreen.current = entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Idle spin about the screen's vertical axis, unless the visitor prefers reduced motion or the
  // computer is too slow: each turn redraws the whole scene, and on a slow one that takes up the
  // whole main thread and the page stops responding.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let last = performance.now()
    const meter = frameMeter(tooSlow)
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000
      last = now
      if (slow.current) return
      if (
        onScreen.current &&
        !document.hidden &&
        !drag.current &&
        !paused.current &&
        !held.current &&
        !easing.current &&
        ztNow.current === 0
      ) {
        setView((v) => orthonormalize(mul(aroundY(SPIN * dt), v)))
        // Not while the labels fade in: that costs more, and only once.
        if (textFading.current) meter.skip()
        else meter.sample()
      } else meter.skip()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      meter.stop()
    }
  }, [])

  // Drag anywhere on the scene to turn it. Listeners on window so a node still gets its click.
  const startDrag = (e: React.PointerEvent) => {
    // Taking hold of the sphere ends the opening at once.
    introSkip.current = true
    // The local graph is flat: no turning while zoomed in.
    if (zoom) return
    drag.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false }
    // Like rolling a ball under the hand: each move turns it about the screen's axes, whatever
    // its current orientation, so it turns freely all the way round in every direction.
    const move = (ev: PointerEvent) => {
      const d = drag.current
      const width = svg.current?.clientWidth || 1
      if (!d) return
      if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < DRAG_PX) return
      d.moved = true
      held.current = false
      const turnY = ((ev.clientX - d.lastX) / width) * Math.PI * 1.5
      const turnX = ((ev.clientY - d.lastY) / width) * Math.PI * 1.5
      d.lastX = ev.clientX
      d.lastY = ev.clientY
      setView((v) => orthonormalize(mul(aroundX(turnX), mul(aroundY(turnY), v))))
    }
    const up = () => {
      if (drag.current?.moved) {
        suppressClick.current = true
        setTimeout(() => (suppressClick.current = false), 0)
      }
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // With nothing selected or hovered, nothing is highlighted or dimmed.
  const active = hover ?? (selected ? id(selected.kind, selected.key) : null)
  const linked = useMemo(() => {
    const set = new Set<string>(active ? [active] : [])
    for (const e of graph.edges) {
      if (active === id('work', e.work)) set.add(id('device', e.device))
      if (active === id('device', e.device)) set.add(id('work', e.work))
    }
    return set
  }, [active, graph])

  const introE = easeOut(intro)
  const shownView = intro < 1 ? mul(aroundY(-(1 - introE) * INTRO_TURN), view) : view
  const textOn = intro >= 1
  const fadeIn = textFade ? 'animate-in fade-in duration-500' : ''
  const turn = (p: Vec3) => apply(shownView, p)
  const shellLit = hover?.startsWith('work:') ?? false
  const coreLit = hover?.startsWith('device:') ?? false
  const mesh = (k: keyof typeof MESH, lit: boolean) => ({
    ...fade,
    strokeOpacity: lit ? MESH[k].lit : MESH[k].idle,
  })
  const nodeRadius = (n: Node, scale: number) => NODE_R[n.kind] * scale
  const labelSize = (n: Node, scale: number) => labelFont(n.kind, scale, zt, ppu)
  const labelGap = (n: Node, scale: number) => nodeRadius(n, scale) + 0.03

  const ringR = zoomed ? ringRadius(graph, zoomed.ring, ppu) : RING_R

  // Node positions: projected from the sphere, then blended towards the local-graph layout.
  // `gone` is how far a node has faded out (nodes unrelated to the zoomed one).
  const pos = new Map<string, Projected>()
  const gone = new Map<string, number>()
  for (const n of graph.nodes) {
    const k = id(n.kind, n.key)
    const p = project(turn(n.base))
    if (!zooming) {
      pos.set(k, p)
      continue
    }
    const angle = zoomed.ring.get(k)
    // Moving the centre: glide from the last drawn place to the new one.
    const was = shift?.from.get(k)
    if (shift && was) {
      const target: Placed =
        k === zoomed.k
          ? { x: 0, y: 0, scale: ZOOM_SCALE.centre, vis: 1 }
          : angle !== undefined
            ? {
                x: Math.cos(angle) * ringR,
                y: Math.sin(angle) * ringR,
                scale: ZOOM_SCALE.ring,
                vis: 1,
              }
            : { x: was.x * 1.6, y: was.y * 1.6, scale: was.scale, vis: 0 } // drifts out
      const e = st
      pos.set(k, {
        x: lerp(was.x, target.x, e),
        y: lerp(was.y, target.y, e),
        z: k === zoomed.k ? 10 : angle !== undefined ? 5 : 0,
        scale: lerp(was.scale, target.scale, e),
      })
      const vis = lerp(was.vis, target.vis, e)
      if (vis < 1) gone.set(k, 1 - vis)
      continue
    }
    if (k === zoomed.k) {
      pos.set(k, {
        x: lerp(p.x, 0, zt),
        y: lerp(p.y, 0, zt),
        z: p.z + 10 * zt,
        scale: lerp(p.scale, ZOOM_SCALE.centre, zt),
      })
    } else if (angle !== undefined) {
      pos.set(k, {
        x: lerp(p.x, Math.cos(angle) * ringR, zt),
        y: lerp(p.y, Math.sin(angle) * ringR, zt),
        z: p.z + 5 * zt,
        scale: lerp(p.scale, ZOOM_SCALE.ring, zt),
      })
    } else {
      // Flying past: pushed outwards as the camera moves in.
      pos.set(k, { ...p, x: p.x * (1 + 1.2 * zt), y: p.y * (1 + 1.2 * zt) })
      gone.set(k, zt)
    }
  }
  // Remember what was drawn, so a centre move can start from it.
  useEffect(() => {
    const m = new Map<string, Placed>()
    for (const [k, p] of pos)
      m.set(k, { x: p.x, y: p.y, scale: p.scale, vis: 1 - (gone.get(k) ?? 0) })
    placedNow.current = m
  })

  // The camera moving in: both polyhedra grow and fade, the core faster (we pass through it).
  const grow = (p: Projected, by: number) => ({ ...p, x: p.x * by, y: p.y * by })
  const shellGrow = 1 + 1.3 * zt
  const coreGrow = 1 + 1.6 * zt

  // Shell: wireframe only. Core: shaded facets (back faces culled) over its back wireframe.
  const shellPts = SHELL_MESH.vertices.map((v) =>
    grow(project(turn([v[0] * SHELL_R, v[1] * SHELL_R, v[2] * SHELL_R])), shellGrow),
  )
  const shell = meshEdges(shellPts, SHELL_MESH.edges)
  const coreRot = CORE_MESH.vertices.map(turn)
  const corePts = coreRot.map((v) =>
    grow(project([v[0] * CORE_R, v[1] * CORE_R, v[2] * CORE_R]), coreGrow),
  )
  const coreBack = meshEdges(corePts, CORE_MESH.edges).back
  const facets: { d: string; opacity: number }[] = []
  for (const [a, b, c] of CORE_MESH.faces) {
    // On a sphere centred at the origin the face's centroid direction is its normal.
    const n = [0, 1, 2].map((k) => coreRot[a][k] + coreRot[b][k] + coreRot[c][k])
    const len = Math.hypot(n[0], n[1], n[2])
    if (n[2] / len <= 0) continue
    const lit = Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / len)
    const [p, q, r] = [corePts[a], corePts[b], corePts[c]]
    facets.push({
      d: `M${p.x.toFixed(4)} ${p.y.toFixed(4)}L${q.x.toFixed(4)} ${q.y.toFixed(4)}L${r.x.toFixed(4)} ${r.y.toFixed(4)}Z`,
      // A pale, see-through core so devices on its far side stay visible; lit facets are paler.
      opacity: 0.3 - 0.22 * lit,
    })
  }

  const choose = (n: Node, clicks: number) => {
    introSkip.current = true
    if (suppressClick.current) return
    onPick({ kind: n.kind, key: n.key }, clicks)
  }

  // Device labels sit close together around the small core: nudge apart any two whose boxes
  // overlap (CJK glyphs are about one em wide). Two labels of the same kind share the move; a
  // device label yields fully to a work label, so a work turned to the centre pushes the device
  // labels out of its way. A few passes are plenty.
  const labelY = new Map<string, number>()
  {
    const boxes = graph.nodes
      .filter((n) => (gone.get(id(n.kind, n.key)) ?? 0) < 0.5)
      .map((n) => {
        const k = id(n.kind, n.key)
        const p = pos.get(k)!
        const fs = labelSize(n, p.scale)
        const gap = labelGap(n, p.scale)
        const w = labelWidth(n.label, fs)
        const x0 = p.x >= 0 ? p.x + gap : p.x - gap - w
        return { k, work: n.kind === 'work', x0, x1: x0 + w, y: p.y, h: fs * 1.5 }
      })
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i], boxes[j]]
          if (a.x1 <= b.x0 || b.x1 <= a.x0) continue
          const need = (a.h + b.h) / 2 - Math.abs(a.y - b.y)
          if (need <= 0) continue
          const dir = a.y <= b.y ? -1 : 1
          const share = a.work === b.work ? 0.5 : a.work ? 0 : 1
          a.y += dir * need * share
          b.y -= dir * need * (1 - share)
        }
      }
    }
    for (const b of boxes) labelY.set(b.k, b.y)
  }

  const renderNode = (n: Node) => {
    const k = id(n.kind, n.key)
    const p = pos.get(k)!
    const isWork = n.kind === 'work'
    const r = nodeRadius(n, p.scale)
    const isActive = k === active
    const isSelected = selected?.kind === n.kind && selected?.key === n.key
    const dim = active !== null && !linked.has(k)
    // Fade with depth so the far side reads as behind. Devices fade less: every device should
    // stay readable through the core.
    const depth = isWork ? SHELL_R : CORE_R
    const near = (p.z + depth) / (2 * depth)
    const fadeOut = gone.get(k) ?? 0
    // In the local graph every remaining node is fully visible, whatever its depth.
    const sphereOpacity = isWork
      ? (dim ? 0.4 : 1) * (0.45 + 0.55 * near)
      : (dim ? 0.6 : 1) * (0.6 + 0.4 * near)
    const shown = zooming ? lerp(sphereOpacity, dim ? 0.55 : 1, zt) : sphereOpacity
    const opacity = shown * (1 - fadeOut)
    const unreachable = fadeOut > 0.5
    const right = p.x >= 0
    return (
      <g
        key={k}
        role="button"
        tabIndex={unreachable ? -1 : 0}
        aria-hidden={unreachable || undefined}
        aria-label={isWork ? t('tools.literature.workLabel', { title: n.label }) : n.label}
        aria-pressed={isSelected}
        className="group cursor-pointer outline-none"
        style={{ opacity, pointerEvents: unreachable ? 'none' : undefined }}
        onClick={(e) => choose(n, e.detail)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPick({ kind: n.kind, key: n.key }, 0)
          }
        }}
        onPointerEnter={() => setHover(k)}
        onPointerLeave={() => setHover((h) => (h === k ? null : h))}
        onFocus={() => setHover(k)}
        onBlur={() => setHover((h) => (h === k ? null : h))}
      >
        {/* Larger invisible hit area for fingers. */}
        <circle cx={p.x} cy={p.y} r={r + 0.05} fill="transparent" />
        <circle
          cx={p.x}
          cy={p.y}
          r={r + (isWork ? 0.028 : 0.02)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={0.01}
          className={cn(
            'transition-opacity',
            isSelected || isActive ? 'opacity-60' : 'opacity-0 group-focus-visible:opacity-100',
          )}
        />
        <circle
          cx={p.x}
          cy={p.y}
          r={r}
          fill={isWork ? 'url(#lit-work)' : 'var(--primary)'}
          stroke="var(--card)"
          strokeWidth={isWork ? 0.008 : 0.01}
        />
        {n.initial && textOn && (
          <text
            x={p.x}
            y={p.y}
            dy="0.36em"
            textAnchor="middle"
            fontSize={snapText(r * 1.05, ppu)}
            fontWeight={700}
            fill="#fff"
            className={`pointer-events-none select-none ${fadeIn}`}
            aria-hidden
          >
            {n.initial}
          </text>
        )}
        {textOn && (
          <text
            x={p.x + (right ? r + 0.03 : -r - 0.03)}
            y={labelY.get(k) ?? p.y}
            dy="0.35em"
            textAnchor={right ? 'start' : 'end'}
            fontSize={snapText(labelSize(n, p.scale), ppu)}
            fontWeight={isWork || isActive ? 600 : 500}
            fill="var(--foreground)"
            stroke="var(--card)"
            strokeWidth={0.018}
            paintOrder="stroke"
            strokeLinejoin="round"
            className={`select-none ${fadeIn}`}
          >
            {n.label}
          </text>
        )}
      </g>
    )
  }

  const edges = graph.edges.map((e) => {
    const a = pos.get(id('work', e.work))!
    const b = pos.get(id('device', e.device))!
    const on = active === id('work', e.work) || active === id('device', e.device)
    const touches = (k?: string) => k === id('work', e.work) || k === id('device', e.device)
    // In the local graph only the centre's links stay; while the centre moves, the old centre's
    // links fade out and the new one's fade in with their nodes.
    const present = Math.min(
      1 - (gone.get(id('work', e.work)) ?? 0),
      1 - (gone.get(id('device', e.device)) ?? 0),
    )
    const keep = !zooming
      ? 1
      : shift
        ? touches(zoomed.k)
          ? present
          : touches(shift.oldK)
            ? present * (1 - st)
            : 0
        : touches(zoomed.k)
          ? 1
          : 1 - zt
    // Stop the line at each sphere's rim rather than its centre, so it never shows through.
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const ra = NODE_R.work * a.scale
    const rb = NODE_R.device * b.scale
    const trim = len > ra + rb
    const from = trim ? { x: a.x + (dx / len) * ra, y: a.y + (dy / len) * ra } : a
    const to = trim ? { x: b.x - (dx / len) * rb, y: b.y - (dy / len) * rb } : b
    return { key: `${e.work}-${e.device}`, from, to, on, keep, z: (a.z + b.z) / 2 }
  })
  const drawEdge = (e: (typeof edges)[number]) => (
    <line
      key={e.key}
      x1={e.from.x}
      y1={e.from.y}
      x2={e.to.x}
      y2={e.to.y}
      stroke="var(--primary)"
      strokeWidth={e.on ? 0.012 : 0.005}
      strokeOpacity={(e.on ? 0.9 : 0.25) * e.keep}
      strokeLinecap="round"
    />
  )

  const nodes = graph.nodes
    .map((n) => ({ n, z: pos.get(id(n.kind, n.key))!.z }))
    .sort((a, b) => a.z - b.z)
  const behind = nodes.filter((x) => x.z < 0)
  const front = nodes.filter((x) => x.z >= 0)

  return (
    <svg
      ref={svg}
      viewBox={`${-VIEW_W / 2} -1 ${VIEW_W} 2`}
      className="block h-full w-full touch-pan-y select-none"
      onPointerDown={startDrag}
      // A node can be remounted while under the pointer (when it passes from the far side to the
      // near side), and then never gets its pointerleave: clear hover whenever the pointer is over
      // empty space or leaves the scene, so the idle spin cannot stay paused.
      onPointerMove={(e) => {
        if (hover && !(e.target as Element).closest('g[role="button"]')) setHover(null)
      }}
      onPointerLeave={() => setHover(null)}
      role="group"
      aria-label={t('tools.literature.sceneLabel')}
      data-still={still ? 'slow' : undefined}
    >
      <defs>
        <radialGradient id="lit-glow">
          <stop offset="0%" style={{ stopColor: 'var(--primary)' }} stopOpacity={0.22} />
          <stop offset="100%" style={{ stopColor: 'var(--primary)' }} stopOpacity={0} />
        </radialGradient>
        {/* Works: green spheres, lit from the upper left. */}
        <radialGradient id="lit-work" cx="35%" cy="30%" r="75%">
          <stop
            offset="0%"
            style={{ stopColor: 'color-mix(in oklab, var(--primary) 88%, white)' }}
          />
          <stop
            offset="100%"
            style={{ stopColor: 'color-mix(in oklab, var(--primary) 70%, black)' }}
          />
        </radialGradient>
      </defs>

      <g
        transform={intro < 1 ? `scale(${INTRO_FROM + (1 - INTRO_FROM) * introE})` : undefined}
        opacity={intro < 1 ? Math.min(1, intro * 3) : undefined}
      >
        <circle r={CORE_R * 2.1 * coreGrow} fill="url(#lit-glow)" opacity={1 - 0.6 * zt} />
        <g opacity={1 - 0.85 * zt}>
          <path
            d={shell.back}
            fill="none"
            stroke="var(--primary)"
            style={mesh('shellBack', shellLit)}
            strokeWidth={0.004}
          />
        </g>
        {grouped.map(([a, b]) => {
          const p = pos.get(id('work', a))!
          const q = pos.get(id('work', b))!
          const keep = 1 - Math.max(gone.get(id('work', a)) ?? 0, gone.get(id('work', b)) ?? 0)
          return (
            <line
              key={`${a}-${b}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke="var(--primary)"
              strokeOpacity={0.3 * keep}
              strokeWidth={0.006}
              strokeDasharray="0.03 0.02"
            />
          )
        })}
        {edges.filter((e) => e.z < 0).map(drawEdge)}
        {behind.map(({ n }) => renderNode(n))}

        <g opacity={1 - zt}>
          <path
            d={coreBack}
            fill="none"
            stroke="var(--primary)"
            style={mesh('coreBack', coreLit)}
            strokeWidth={0.004}
          />
          {facets.map((f, i) => (
            <path
              key={i}
              d={f.d}
              fill="var(--primary)"
              fillOpacity={f.opacity}
              stroke="var(--card)"
              style={mesh('coreEdge', coreLit)}
              strokeWidth={0.004}
              strokeLinejoin="round"
            />
          ))}
        </g>
        <g opacity={1 - 0.85 * zt}>
          <path
            d={shell.front}
            fill="none"
            stroke="var(--primary)"
            style={mesh('shellFront', shellLit)}
            strokeWidth={0.005}
          />
        </g>
        {edges.filter((e) => e.z >= 0).map(drawEdge)}
        {front.map(({ n }) => renderNode(n))}
      </g>
    </svg>
  )
}

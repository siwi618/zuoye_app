import { useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SceneProps, Tool } from './types'
import { Coral, Fish, type CoralKind } from './shared'
import { FISH_COUNT, useFish } from './useFish'
import { useReducedMotion } from './useReducedMotion'

// The toolbox is one coral colony. The trunk splits into a branch per subject, each tool is a
// branch tip (a planned tool would be a bud). Picking a tip lights the path from the root, the
// way a future knowledge map would trace a link. Small corals on the seabed and a few fish keep
// the water alive: polyps open under the pointer, fish scatter from it.

// Seabed decoration: left edge of each coral in % of the stage, its height in px.
const DECOR: { kind: CoralKind; left: number; size: number }[] = [
  { kind: 'staghorn', left: 3, size: 92 },
  { kind: 'fan', left: 14, size: 66 },
  { kind: 'staghorn', left: 26, size: 54 },
  { kind: 'fan', left: 64, size: 58 },
  { kind: 'staghorn', left: 76, size: 96 },
  { kind: 'fan', left: 89, size: 62 },
]

// The trunk is a filled shape, flared at the root like a tree and narrowing to the fork, so it
// can carry the Coral Study mark. Its centre line is still the 'trunk' segment for highlight and flow.
const TRUNK_D =
  'M416 634 C450 628 461 614 461 596 C460 566 461 520 467 484 C468 468 467 452 466 438 Q500 446 534 438 C533 452 532 468 533 484 C539 520 540 566 539 596 C539 614 550 628 584 634 Z'
const TRUNK_POLYPS = [
  [470, 494],
  [532, 520],
  [461, 606],
  [539, 614],
]
const LOGO = { x: 473, y: 522, size: 54 }
// Main branches leave from the trunk's shoulders, this far either side of the centre line.
const SHOULDER = 17
// Branch widths, base to tip. Each branch starts as wide as whatever it grows out of and keeps
// its old tip width, so the colony thins out like a tree: trunk shoulder 34 -> 24 at the subject
// fork -> 12 at a tool.
const WIDTH = { 1: [34, 24], 2: [24, 12] } as const

// Seconds into the opening when the light first runs: the first tip's icon is fully out by then.
const FLOW_START = 2.1

const W = 1000
const H = 640
const ROOT = { x: 500, y: 630 }
const FORK = { x: 500, y: 450 }

type Pt = { x: number; y: number }
type Seg = { id: string; a: Pt; c1: Pt; c2: Pt; b: Pt; level: 0 | 1 | 2 }

function at(s: Seg, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * u * s.a.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.b.x,
    y: u * u * u * s.a.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.b.y,
  }
}

function tangent(s: Seg, t: number): Pt {
  const u = 1 - t
  return {
    x: 3 * u * u * (s.c1.x - s.a.x) + 6 * u * t * (s.c2.x - s.c1.x) + 3 * t * t * (s.b.x - s.c2.x),
    y: 3 * u * u * (s.c1.y - s.a.y) + 6 * u * t * (s.c2.y - s.c1.y) + 3 * t * t * (s.b.y - s.c2.y),
  }
}

// Unit normal at t, flipped to point upwards (towards smaller y): on a main branch that is the
// open water inside the fork.
function above(s: Seg, t: number): Pt {
  const g = tangent(s, t)
  const len = Math.hypot(g.x, g.y) || 1
  const n = { x: -g.y / len, y: g.x / len }
  return n.y > 0 ? { x: -n.x, y: -n.y } : n
}

// Points spaced evenly by arc length along consecutive segments, read as one path: the spacing
// stays the same across a joint, so the light doesn't skip where one branch grows out of another.
// The first point sits `from` along the path, the last at most `end` short of its far tip.
function evenly(chain: Seg[], from: number, gap: number, end: number): Pt[] {
  const pts: Pt[] = []
  const acc: number[] = []
  let total = 0
  chain.forEach((s) => {
    for (let i = pts.length ? 1 : 0; i <= 64; i++) {
      const p = at(s, i / 64)
      if (pts.length) total += Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y)
      pts.push(p)
      acc.push(total)
    }
  })
  const span = total - end - from
  if (span <= 0) return []
  const n = Math.max(1, Math.round(span / gap))
  const out: Pt[] = []
  let k = 0
  for (let i = 0; i <= n; i++) {
    const want = from + (span * i) / n
    while (k < acc.length - 2 && acc[k + 1] < want) k++
    const f = (want - acc[k]) / (acc[k + 1] - acc[k] || 1)
    out.push({ x: pts[k].x + (pts[k + 1].x - pts[k].x) * f, y: pts[k].y + (pts[k + 1].y - pts[k].y) * f })
  }
  return out
}

const d = (s: Seg) => `M${s.a.x} ${s.a.y} C${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.b.x} ${s.b.y}`

// A branch as a filled outline whose width runs from w0 at the base to w1 at the tip, with a
// round tip so the next branch (which starts at w1) joins without a seam.
function taper(s: Seg, w0: number, w1: number, steps = 28) {
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = at(s, t)
    const g = tangent(s, t)
    const len = Math.hypot(g.x, g.y) || 1
    const h = (w0 + (w1 - w0) * t) / 2
    const nx = (-g.y / len) * h
    const ny = (g.x / len) * h
    left.push(`${(p.x + nx).toFixed(1)} ${(p.y + ny).toFixed(1)}`)
    right.push(`${(p.x - nx).toFixed(1)} ${(p.y - ny).toFixed(1)}`)
  }
  const r = (w1 / 2).toFixed(1)
  return `M${left.join(' L')} A${r} ${r} 0 0 0 ${right[steps]} L${right.reverse().slice(1).join(' L')} Z`
}

function layout(subjects: SceneProps['subjects']) {
  const segs: Seg[] = [{ id: 'trunk', a: ROOT, c1: { x: 500, y: 576 }, c2: { x: 502, y: 504 }, b: FORK, level: 0 }]
  const nodes: { tool: Tool; subject: string; at: Pt; chain: string[] }[] = []
  const labels: { key: string; at: Pt; side: Pt; empty: boolean }[] = []
  // A subject with no tools ends in a short bare tip instead of a cut-off branch.
  const stubs: Seg[] = []
  const n = subjects.length
  subjects.forEach((s, i) => {
    const off = i - (n - 1) / 2
    const dir = Math.sign(off)
    const S = { x: 500 + off * 370, y: 310 }
    // Each main branch leaves from its own shoulder of the trunk, rises first, then leans out,
    // arriving at S heading up and only slightly outwards, so the tool tips split from it as a Y.
    const A = { x: FORK.x + dir * SHOULDER, y: FORK.y - 6 }
    segs.push({
      id: `s-${s.key}`,
      a: A,
      c1: { x: A.x + dir * 12, y: A.y - 90 },
      c2: { x: S.x - dir * 56, y: S.y + 96 },
      b: S,
      level: 1,
    })
    const m = s.tools.length
    if (m === 0) {
      const b = { x: S.x + dir * 34, y: S.y - 78 }
      stubs.push({ id: `stub-${s.key}`, a: S, c1: { x: S.x + dir * 24, y: S.y - 24 }, c2: { x: b.x, y: b.y + 36 }, b, level: 2 })
    }
    s.tools.forEach((tool, j) => {
      // Tips fan around a slight outward lean, so a branch never bends back on itself at S.
      const deg = dir * 8 + (m === 1 ? 0 : -32 + (64 * j) / (m - 1))
      const rad = (deg * Math.PI) / 180
      const L = 190
      const B = { x: Math.round(S.x + Math.sin(rad) * L), y: Math.round(S.y - Math.cos(rad) * L) }
      segs.push({
        id: `t-${tool.key}`,
        a: S,
        // Carry the main branch's heading out of S before bending towards the tip.
        c1: { x: S.x + dir * 24, y: S.y - 42 },
        c2: { x: B.x, y: B.y + 70 },
        b: B,
        level: 2,
      })
      nodes.push({ tool, subject: s.key, at: B, chain: ['trunk', `s-${s.key}`, `t-${tool.key}`] })
    })
  })
  // Short side twigs off each main branch give the colony some body; they carry polyps but no tools.
  const twigs: Seg[] = segs
    .filter((s) => s.level === 1)
    .map((s) => {
      const p = at(s, 0.64)
      const side = s.b.x > s.a.x ? 1 : -1
      const b = { x: p.x + side * 56, y: p.y - 40 }
      return { id: `${s.id}-tw`, a: p, c1: { x: p.x + side * 10, y: p.y - 20 }, c2: { x: b.x - side * 12, y: b.y + 12 }, b, level: 2 as const }
    })
  // Subject labels sit beside the middle of their main branch, inside the fork. On a phone the two
  // would touch there, so each also gets a spot just outside its branch (`side`).
  segs
    .filter((s) => s.level === 1)
    .forEach((s, i) => {
      const empty = subjects[i].tools.length === 0
      const mid = at(s, 0.5)
      const n = above(s, 0.5)
      // The empty-subject chip carries a second line and runs wider, so it sits further in.
      const off = empty ? 66 : 38
      const dir = Math.sign(s.b.x - s.a.x)
      labels.push({
        key: subjects[i].key,
        at: { x: mid.x + n.x * off, y: mid.y + n.y * off },
        side: { x: mid.x + dir * 90, y: mid.y + 20 },
        empty,
      })
    })
  return { segs, twigs, nodes, labels, stubs }
}

// Spacing between lights on the branches, and how far short of a tool's tip they stop (the tip's
// icon covers the rest).
const FLOW_GAP = 45
const FLOW_TIP = 36

// The lights along a picked chain, root to tip. On the trunk the light also passes through its four
// polyps, climbing bottom to top; from there on it runs evenly along the main branch and on into
// the tool's branch as one path, starting one gap above the trunk's top light.
function flowDots(chain: Seg[]) {
  const trunk = chain.find((s) => s.level === 0)
  const rest = chain.filter((s) => s.level > 0).sort((a, b) => a.level - b.level)
  const dots = trunk
    ? [
        // 0.4 bridges the long climb between the low polyps and the middle ones.
        ...[0.12, 0.4, 0.86].map((k) => ({ id: `${trunk.id}-${k}`, p: at(trunk, k), polyp: false })),
        ...TRUNK_POLYPS.map(([x, y]) => ({ id: `${trunk.id}-p${x}`, p: { x, y }, polyp: true })),
      ].sort((a, b) => b.p.y - a.p.y)
    : []
  if (rest.length) {
    const top = trunk ? at(trunk, 0.86) : rest[0].a
    const from = Math.max(FLOW_GAP / 3, FLOW_GAP - Math.hypot(rest[0].a.x - top.x, rest[0].a.y - top.y))
    evenly(rest, from, FLOW_GAP, FLOW_TIP).forEach((p, i) => dots.push({ id: `${rest[rest.length - 1].id}-${i}`, p, polyp: false }))
  }
  return dots
}

export function GrowthScene({ subjects }: SceneProps) {
  const { t } = useTranslation()
  const { segs, twigs, nodes, labels, stubs } = useMemo(() => layout(subjects), [subjects])
  const sceneRef = useRef<HTMLElement>(null)
  const still = useReducedMotion()
  const fishRefs = useFish(sceneRef, still)
  const gradId = `tbx-logo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const firstLive = nodes.find((n) => n.tool.status === 'live') ?? nodes[0]
  const [activeKey, setActiveKey] = useState(firstLive?.tool.key)
  // On opening, the light waits until the picked tip's icon is out (see the tbx-bud timings in
  // toolbox.css); once someone picks another tip it starts at once.
  const [moved, setMoved] = useState(false)
  const flowStart = moved ? 0 : FLOW_START
  const active = nodes.find((n) => n.tool.key === activeKey) ?? firstLive
  const chain = new Set(active?.chain ?? [])

  return (
    <section ref={sceneRef} className="tbx-grow">
      <div className="tbx-grow__school" aria-hidden="true">
        {Array.from({ length: FISH_COUNT }, (_, i) => (
          <div
            key={i}
            className="tbx-fish"
            ref={(el) => {
              fishRefs.current[i] = el
            }}
          >
            <Fish />
          </div>
        ))}
      </div>

      <div className="tbx-grow__stage">
        <div className="tbx-grow__seabed" aria-hidden="true">
          {DECOR.map((c, i) => (
            <span
              key={i}
              className="tbx-deco"
              style={{ left: `${c.left}%`, width: (c.size * 120) / 140, height: c.size, animationDelay: `${i * -1.1}s` }}
            >
              <Coral kind={c.kind} />
            </span>
          ))}
        </div>

        <svg className="tbx-grow__svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <g className="tbx-grow__plankton">
            {Array.from({ length: 22 }, (_, i) => (
              <circle key={i} cx={(i * 173) % W} cy={(i * 97) % (H - 120)} r={1.5 + (i % 3)} style={{ animationDelay: `${i * -0.9}s` }} />
            ))}
          </g>
          {twigs.map((s) => (
            <g key={s.id}>
              <path d={d(s)} className="tbx-grow__path tbx-grow__path--twig" pathLength={1} />
              <circle cx={s.b.x} cy={s.b.y} r="5" className="tbx-grow__polyp" />
            </g>
          ))}
          {stubs.map((st) => (
            <g key={st.id}>
              <path d={taper(st, 24, 10)} className="tbx-grow__branch tbx-grow__branch--l2" style={{ transformOrigin: `${st.a.x}px ${st.a.y}px` }} />
              <circle cx={st.b.x} cy={st.b.y} r="7" className="tbx-grow__polyp" />
            </g>
          ))}
          <path d={TRUNK_D} className="tbx-grow__trunk" />
          {TRUNK_POLYPS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" className="tbx-grow__polyp" />
          ))}
          {segs
            .filter((s) => s.level === 1)
            .map((s) => {
              const e = at(s, 0.38)
              return (
                <linearGradient
                  key={`g-${s.id}`}
                  id={`${gradId}-${s.id}`}
                  gradientUnits="userSpaceOnUse"
                  x1={s.a.x}
                  y1={s.a.y}
                  x2={e.x}
                  y2={e.y}
                >
                  <stop offset="0" className="tbx-blend__from" />
                  <stop offset="1" className="tbx-blend__to" />
                </linearGradient>
              )
            })}
          {segs
            .filter((s) => s.level > 0)
            .map((s) => {
              const [w0, w1] = WIDTH[s.level as 1 | 2]
              return (
                <path
                  key={s.id}
                  d={taper(s, w0, w1)}
                  className={`tbx-grow__branch tbx-grow__branch--l${s.level}${chain.has(s.id) ? ' is-on' : ''}`}
                  style={{ transformOrigin: `${s.a.x}px ${s.a.y}px` }}
                />
              )
            })}
          {/* The trunk's colour runs up into the base of each main branch, so the fork reads as one piece. */}
          {segs
            .filter((s) => s.level === 1)
            .map((s) => (
              <path
                key={`b-${s.id}`}
                d={taper(s, ...WIDTH[1])}
                fill={`url(#${gradId}-${s.id})`}
                className="tbx-grow__blend"
                style={{ transformOrigin: `${s.a.x}px ${s.a.y}px` }}
              />
            ))}
          {/* Light travelling root to tip along the picked chain. */}
          {flowDots(segs.filter((s) => chain.has(s.id))).map(({ id, p, polyp }, i) => (
              <circle
                key={`${activeKey}-${id}`}
                cx={p.x}
                cy={p.y}
                r={polyp ? 5 : 4.5}
                className={`tbx-grow__flow${polyp ? ' tbx-grow__flow--polyp' : ''}`}
                style={{ animationDelay: `${flowStart + i * 0.11}s` }}
              />
            ))}
          {/* Coral Study mark on the trunk: the same drawing as the nav logo and favicon. */}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className="tbx-logo__from" />
              <stop offset="1" className="tbx-logo__to" />
            </linearGradient>
          </defs>
          <g className="tbx-grow__logo" transform={`translate(${LOGO.x} ${LOGO.y})`}>
            <rect width={LOGO.size} height={LOGO.size} rx="12" fill={`url(#${gradId})`} className="tbx-logo__tile" />
            <g transform="translate(8 8) scale(0.59)" className="tbx-logo__mark">
              <path d="M32 58V13" />
              <path d="M32 45c0-8-12-7-12-18v-6" />
              <path d="M32 40c0-8 12-7 12-18v-6" />
              <path d="M32 52c0-6-21-5-21-17v-1" />
              <path d="M32 49c0-6 21-5 21-17v-1" />
              <circle cx="32" cy="11" r="4.6" />
              <circle cx="20" cy="19" r="4.6" />
              <circle cx="44" cy="14" r="4.6" />
              <circle cx="11" cy="31" r="4" />
              <circle cx="53" cy="29" r="4" />
            </g>
          </g>
        </svg>

        {labels.map((l, i) => (
          <span
            key={l.key}
            className={`tbx-grow__subject${active?.subject === l.key ? ' is-on' : ''}`}
            style={
              {
                '--i': i,
                '--x': `${(l.at.x / W) * 100}%`,
                '--y': `${(l.at.y / H) * 100}%`,
                '--x-side': `${(l.side.x / W) * 100}%`,
                '--y-side': `${(l.side.y / H) * 100}%`,
              } as CSSProperties
            }
          >
            {t(`tools.categories.${l.key}`)}
            {l.empty && <span className="tbx-grow__soon">{t('tools.comingSoon')}</span>}
          </span>
        ))}

        {nodes.map((n, i) => {
          const on = n.tool.key === active?.tool.key
          const cls = `tbx-node tbx-node--${n.tool.status}${on ? ' is-on' : ''}`
          const style = { left: `${(n.at.x / W) * 100}%`, top: `${(n.at.y / H) * 100}%`, '--i': i } as CSSProperties
          const pick = () => {
            if (n.tool.key !== activeKey) setMoved(true)
            setActiveKey(n.tool.key)
          }
          const inner = (
            <>
              <span className="tbx-node__dot">{n.tool.icon && <img src={n.tool.icon} alt="" />}</span>
              <span className="tbx-node__name">{t(`tools.items.${n.tool.key}`)}</span>
            </>
          )
          // A live tool's tip opens the tool; hovering or focusing it still lights its branch.
          return n.tool.status === 'live' && n.tool.to ? (
            <Link key={n.tool.key} to={n.tool.to} className={cls} style={style} onPointerEnter={pick} onFocus={pick}>
              {inner}
            </Link>
          ) : (
            <button
              key={n.tool.key}
              type="button"
              className={cls}
              style={style}
              aria-pressed={on}
              onClick={pick}
              onPointerEnter={pick}
              onFocus={pick}
            >
              {inner}
            </button>
          )
        })}

        <p className="tbx-grow__hint">{t('tools.grow.hint')}</p>
      </div>

      {active && (
        <aside className="tbx-grow__panel" aria-live="polite">
          <span className="tbx-grow__panelsubject">{t(`tools.categories.${active.subject}`)}</span>
          <h2 className="tbx-grow__panelname">{t(`tools.items.${active.tool.key}`)}</h2>
          <p className="tbx-grow__panelblurb">{t(`tools.blurbs.${active.tool.key}`)}</p>
          {active.tool.status === 'live' && active.tool.to ? (
            <Link to={active.tool.to} className="tbx-btn">
              {t('tools.openTool', { name: t(`tools.items.${active.tool.key}`) })}
            </Link>
          ) : (
            <span className="tbx-grow__panelstate">{t('tools.planned')}</span>
          )}
        </aside>
      )}
    </section>
  )
}

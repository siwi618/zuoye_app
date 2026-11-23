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

// Seabed decoration: left edge of each coral in % of the stage (past 100 runs on under the side
// card on a wide screen), its height in px, and its row (`lift` raises a near one onto the reef, in % of
// the stage, so the front row doesn't stand on one line). Far corals are smaller and paler and stand
// on the back ridge, half hidden by the reef in front; near ones stand on the sand. The middle of
// the stage stays clear for the trunk.
type Decor = { kind: CoralKind; left: number; size: number; far?: boolean; lift?: number }
const DECOR: Decor[] = [
  { kind: 'tube', left: 6, size: 46, far: true },
  { kind: 'table', left: 21, size: 50, far: true },
  { kind: 'brain', left: 35, size: 54, far: true },
  { kind: 'fan', left: 58, size: 44, far: true },
  { kind: 'staghorn', left: 70, size: 54, far: true },
  { kind: 'tube', left: 99, size: 50, far: true },
  { kind: 'fan', left: 119, size: 50, far: true },
  { kind: 'staghorn', left: 0, size: 92 },
  { kind: 'brain', left: 10, size: 70, lift: 2 },
  { kind: 'fan', left: 19, size: 62 },
  { kind: 'tube', left: 28, size: 72, lift: 3.5 },
  { kind: 'table', left: 62, size: 78, lift: 1.5 },
  { kind: 'staghorn', left: 75, size: 94 },
  { kind: 'brain', left: 85, size: 64, lift: 3.5 },
  { kind: 'fan', left: 93, size: 58 },
  { kind: 'tube', left: 104, size: 76, lift: 2 },
  { kind: 'table', left: 115, size: 74, lift: 4 },
  { kind: 'staghorn', left: 127, size: 84 },
]

// The reef the colony stands on, in three layers drawn on a 1400 x 160 strip: a pale far ridge,
// a bumpy middle reef dotted with pores, and a strip of sand in front.
const REEF_BACK =
  'M0 160 L0 70 C80 52 150 40 240 50 C320 58 360 34 450 30 C540 26 600 52 690 56 C780 60 830 36 930 34 C1030 32 1090 58 1180 54 C1260 50 1320 38 1400 44 L1400 160 Z'
const REEF_MID =
  'M0 160 L0 100 C40 86 70 84 100 94 C130 80 170 76 200 90 C240 96 270 82 310 86 C350 90 370 100 420 96 C470 92 490 78 540 82 C590 86 610 100 660 98 C700 96 720 86 760 88 C800 90 830 102 880 98 C930 94 950 80 1000 84 C1050 88 1070 98 1120 96 C1170 94 1190 82 1240 86 C1290 90 1320 100 1360 94 C1380 92 1390 90 1400 92 L1400 160 Z'
const REEF_SAND =
  'M0 160 L0 136 C120 128 240 140 380 134 C520 128 640 140 780 136 C920 132 1040 142 1180 136 C1280 132 1350 134 1400 132 L1400 160 Z'
const REEF_PORES = Array.from({ length: 34 }, (_, i) => ({
  x: 20 + ((i * 397) % 1360),
  y: 106 + ((i * 53) % 24),
  r: 2 + (i % 3),
}))
const REEF_PEBBLES = Array.from({ length: 16 }, (_, i) => ({ x: 40 + ((i * 271) % 1320), y: 146 + ((i * 31) % 9), r: 3 + (i % 3) }))

function Reef({ layer }: { layer: 'back' | 'front' }) {
  return (
    <svg className={`tbx-reef tbx-reef--${layer}`} viewBox="0 0 1400 160" preserveAspectRatio="xMidYMax slice">
      {layer === 'back' ? (
        <path d={REEF_BACK} className="tbx-reef__ridge" />
      ) : (
        <>
          <path d={REEF_MID} className="tbx-reef__rock" />
          {REEF_PORES.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.r} className="tbx-reef__pore" />
          ))}
          <path d={REEF_SAND} className="tbx-reef__sand" />
          {REEF_PEBBLES.map((p, i) => (
            <ellipse key={i} cx={p.x} cy={p.y} rx={p.r * 1.6} ry={p.r} className="tbx-reef__pebble" />
          ))}
        </>
      )}
    </svg>
  )
}

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
      // It leaves the underside of the branch heading outwards, dips a little, and lifts its tip up
      // and out, so it reads as its own sprig rather than lying along the branch.
      const p = at(s, 0.6)
      const side = s.b.x > s.a.x ? 1 : -1
      const b = { x: p.x + side * 60, y: p.y - 6 }
      return { id: `${s.id}-tw`, a: p, c1: { x: p.x + side * 26, y: p.y + 14 }, c2: { x: b.x - side * 14, y: b.y + 16 }, b, level: 2 as const }
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

// The octopus at the bottom left, drawn the way the colony is (flat fills in the coral's own teal,
// no outlines, the rock a lump of the same reef): it hides in a rock on the seabed and holds out a
// tool that isn't one of the coral's own (活动指南, there only while the student council has
// events). Its arm grows like a coral branch, tapering and forking, with a thin twig and a side arm
// that end in polyps. It rises from the rock and arrives straight up under HOLD, behind the tool's
// icon; the arm's tip wrapping round the icon is drawn on the icon itself (Grip), in front of it.
const HOLD = { x: 100, y: 392 }
const ARM: Seg = { id: 'arm', a: { x: 116, y: 622 }, c1: { x: 92, y: 530 }, c2: { x: HOLD.x, y: HOLD.y + 120 }, b: HOLD, level: 2 }
const ARM_WIDTH = [30, 11] as const
// The seabed corals (near and far) where the rock stands make way for it, so none pokes out from
// behind it or the arm: the rock runs to 23% of the stage.
const ROCK_CLEAR = 23
const ROCK =
  'M14 640 C10 604 26 572 56 566 C78 562 92 572 98 584 C112 596 156 598 166 584 C176 566 198 556 216 570 C232 584 234 616 228 640 Z'
// The front lip of the rock's hollow, over the root of the arm.
const ROCK_LIP = 'M64 640 L70 588 C92 606 156 606 170 590 L176 640 Z'
const ROCK_PITS = [
  [44, 604, 5],
  [64, 586, 3.5],
  [192, 590, 4.5],
  [206, 616, 3],
  [140, 622, 4],
  [30, 628, 3],
]
// The side arm forks off halfway up towards the colony, rising and leaning out like a tool's branch
// off a subject; the twig leaves the other side lower down, the way the colony's twigs do.
function off(t: number, dx: number, dy: number, lift: number): Seg {
  const a = at(ARM, t)
  const b = { x: a.x + dx, y: a.y + dy }
  return { id: `arm-${t}`, a, c1: { x: a.x + dx * 0.15, y: a.y - lift }, c2: { x: b.x - dx * 0.3, y: b.y + lift * 0.8 }, b, level: 2 }
}
// The side arm curls up at its end, arriving heading straight up like a tool's tip on the colony.
const ARM_FORK: Seg = (() => {
  const s = off(0.56, 62, -60, 26)
  return { ...s, c2: { x: s.b.x - 4, y: s.b.y + 40 } }
})()
const ARM_FORK_WIDTH = [17, 7] as const
const ARM_TWIG = off(0.3, -50, -16, -10)
// Suckers seen side on: a row of small round bumps along the arm's outer edge above the twig, half
// tucked behind the arm, shrinking towards the tip and stopping short of the held icon's glow.
const SUCKERS = Array.from({ length: 7 }, (_, i) => {
  const t = 0.37 + i * 0.07
  const p = at(ARM, t)
  const g = tangent(ARM, t)
  const len = Math.hypot(g.x, g.y) || 1
  const w = ARM_WIDTH[0] + (ARM_WIDTH[1] - ARM_WIDTH[0]) * t
  // The normal on the arm's left as it climbs: the side facing away from the coral.
  const n = { x: g.y / len, y: -g.x / len }
  const r = w * 0.2
  return { x: p.x + n.x * (w / 2 - r * 0.2), y: p.y + n.y * (w / 2 - r * 0.2), r }
})

// Party dress for event days (`festive`). A party hat sits on the head, leaning right: a gold cone
// with two stripes and a pompom. HAT gives its base corners and tip; the stripes are bands across it.
const HAT = { l: { x: 121, y: 557 }, r: { x: 154, y: 552 }, tip: { x: 147, y: 513 } }
function hatBand(t0: number, t1: number) {
  const on = (p: Pt, t: number) => `${(p.x + (HAT.tip.x - p.x) * t).toFixed(1)} ${(p.y + (HAT.tip.y - p.y) * t).toFixed(1)}`
  return `M${on(HAT.l, t0)} L${on(HAT.r, t0)} L${on(HAT.r, t1)} L${on(HAT.l, t1)} Z`
}
const HAT_D = `M${HAT.l.x} ${HAT.l.y} L${HAT.r.x} ${HAT.r.y} L${HAT.tip.x} ${HAT.tip.y} Z`

// A party horn in the corner of the mouth, at the head's right edge just above the rock: a short
// mouthpiece, then a paper tube rolled up into a curl. Blown, the curl hides and the tube shoots out
// straight (drawn along +x inside a group turned to the horn's heading, so it can scale out from the
// mouthpiece) with a puff of confetti at its end, then rolls back up.
const HORN = { x: 168, y: 579, deg: -18, len: 70 }
// The tap target over the head, hat and horn (the scene's svg takes no pointer events).
const POKE = { x: 104, y: 508, w: 140, h: 86 }
const HORN_CURL = 'M168 579 C176 576 186 575 190 568 C194 560 185 555 180 561 C177 566 184 569 186 565'
const CONFETTI = [
  { x: 6, y: -10, k: 'red' },
  { x: 10, y: 0, k: 'gold' },
  { x: 6, y: 10, k: 'blue' },
]

function Hat() {
  return (
    <g className="tbx-hat">
      <path d={HAT_D} className="tbx-hat__cone" />
      <path d={hatBand(0.18, 0.33)} className="tbx-hat__band tbx-hat__band--red" />
      <path d={hatBand(0.5, 0.63)} className="tbx-hat__band tbx-hat__band--blue" />
      <circle cx={HAT.tip.x} cy={HAT.tip.y} r="5" className="tbx-hat__pompom" />
    </g>
  )
}

// `blows` counts taps; each new count remounts the horn (and the happy eyes) so their one-shot
// animation plays again from the start.
function Horn({ blows }: { blows: number }) {
  return (
    <g key={blows} className={`tbx-horn${blows ? ' is-blowing' : ''}`}>
      <path d={HORN_CURL} className="tbx-horn__tube tbx-horn__curl" />
      <g transform={`translate(${HORN.x} ${HORN.y}) rotate(${HORN.deg})`}>
        <path d={`M0 0 H${HORN.len}`} className="tbx-horn__tube tbx-horn__straight" />
        <g transform={`translate(${HORN.len} 0)`}>
          {CONFETTI.map((c) => (
            <circle key={c.k} cx={c.x} cy={c.y} r="3" className={`tbx-horn__confetti tbx-horn__confetti--${c.k}`} />
          ))}
        </g>
      </g>
      <path d={`M157 583 L${HORN.x} ${HORN.y}`} className="tbx-horn__mouthpiece" />
    </g>
  )
}

// Picked, the arm has no lights running up it like the coral's branches: its suckers swell and
// shrink in turn instead, base to tip, starting when the lights would (`start`, in seconds). On
// event days (`party`) the suckers are red and blue party bulbs that twinkle.
function Octopus({ on, start, party, blows }: { on: boolean; start: number; party: boolean; blows: number }) {
  return (
    <g className="tbx-octo">
      <ellipse cx="136" cy="598" rx="44" ry="14" className="tbx-octo__hollow" />
      {/* The arm rises from behind the head (and the rock). */}
      <g className={`tbx-octo__arm${on ? ' is-on' : ''}`} style={{ transformOrigin: `${ARM.a.x}px ${ARM.a.y}px` }}>
        <path d={d(ARM_TWIG)} className="tbx-grow__path tbx-grow__path--twig tbx-octo__twig" pathLength={1} />
        <circle cx={ARM_TWIG.b.x} cy={ARM_TWIG.b.y} r="5" className="tbx-grow__polyp" />
        <path d={taper(ARM_FORK, ...ARM_FORK_WIDTH)} className="tbx-octo__fork" />
        <circle cx={ARM_FORK.b.x} cy={ARM_FORK.b.y} r="5" className="tbx-grow__polyp" />
        {SUCKERS.map((c, i) => (
          <circle
            key={`${on}-${i}`}
            cx={c.x}
            cy={c.y}
            // Bulbs are a little bigger than suckers, so they read as lights.
            r={party ? c.r * 1.3 : c.r}
            className={`tbx-octo__sucker${party ? ` tbx-octo__bulb tbx-octo__bulb--${i % 2 ? 'blue' : 'red'}` : ''}`}
            style={on ? { animationDelay: `${start + i * 0.12}s` } : undefined}
          />
        ))}
        <path d={taper(ARM, ...ARM_WIDTH)} className="tbx-octo__skin" />
      </g>
      <g className="tbx-octo__head">
        <path d="M100 610 C98 576 114 550 136 550 C158 550 174 576 172 610 Z" className="tbx-octo__skin" />
        {party && <Hat />}
        <g key={blows} className={`tbx-octo__eyes${blows ? ' is-happy' : ''}`}>
          {[126, 150].map((x) => (
            <g key={x}>
              <circle cx={x} cy="580" r="5.5" className="tbx-octo__eye" />
              <circle cx={x - 1.2} cy="578.6" r="2.4" className="tbx-octo__pupil" />
              {/* Shut in a smile (^ ^) while it blows. */}
              <path d={`M${x - 5} 581 Q${x} 574 ${x + 5} 581`} className="tbx-octo__smile" />
            </g>
          ))}
        </g>
      </g>
      <path d={ROCK} className="tbx-octo__rock" />
      {ROCK_PITS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} className="tbx-octo__pit" />
      ))}
      <path d={ROCK_LIP} className="tbx-octo__rock" />
      {party && <Horn blows={blows} />}
    </g>
  )
}

// The arm's tip on the held tool's icon, drawn round a 64 px icon (radius 32) and scaled with it.
// It comes up under the icon where the arm meets it and cradles its lower left, about a fifth of the
// way round, ending in a small curl: holding the tool up rather than wrapping it. Its stroke runs in container units so it is exactly as wide as the arm in the scene, which
// scales with the stage while the icon doesn't.
function Grip() {
  return (
    <svg className="tbx-node__grip" viewBox="-45 -45 90 90" aria-hidden="true">
      <path d="M0 50 C0 44 1 39 0 37 A37 37 0 0 1 -30 21.7" className="tbx-node__grip-arm" />
      <path d="M-30 21.7 A37 37 0 0 1 -36.4 6.4 C-37.4 0 -42.5 -1.5 -43 3" className="tbx-node__grip-tip" />
    </svg>
  )
}

function Deco({ c, i }: { c: Decor; i: number }) {
  return (
    <span
      className={`tbx-deco${c.far ? ' tbx-deco--far' : ''}`}
      style={{
        left: `${c.left}%`,
        ...(c.lift ? { bottom: `${c.lift}%` } : {}),
        width: (c.size * 120) / 140,
        height: c.size,
        animationDelay: `${i * -1.1}s`,
      }}
    >
      <Coral kind={c.kind} />
    </span>
  )
}

export function GrowthScene({ subjects, held, festive }: SceneProps) {
  const { t } = useTranslation()
  const { segs, twigs, nodes, labels, stubs } = useMemo(() => {
    const l = layout(subjects)
    if (held) l.nodes.push({ tool: held, subject: 'council', at: HOLD, chain: [ARM.id] })
    return l
  }, [subjects, held])
  const sceneRef = useRef<HTMLElement>(null)
  const still = useReducedMotion()
  const fishRefs = useFish(sceneRef, still)
  const gradId = `tbx-logo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const firstLive = nodes.find((n) => n.tool.status === 'live') ?? nodes[0]
  const [activeKey, setActiveKey] = useState(firstLive?.tool.key)
  // On opening, the light waits until the picked tip's icon is out (see the tbx-bud timings in
  // toolbox.css); once someone picks another tip it starts at once.
  const [moved, setMoved] = useState(false)
  // Taps on the party octopus: each one blows the horn once.
  const [blows, setBlows] = useState(0)
  const party = !!held && !!festive
  const flowStart = moved ? 0 : FLOW_START
  const active = nodes.find((n) => n.tool.key === activeKey) ?? firstLive
  const chain = new Set(active?.chain ?? [])

  return (
    <section ref={sceneRef} className={`tbx-grow${party ? ' tbx-grow--party' : ''}`}>
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
          <Reef layer="back" />
          {DECOR.filter((c) => c.far).map((c, i) =>
            held && c.left < ROCK_CLEAR ? null : <Deco key={`f${i}`} c={c} i={i} />,
          )}
          <Reef layer="front" />
          {DECOR.filter((c) => !c.far).map((c, i) =>
            held && c.left < ROCK_CLEAR ? null : <Deco key={`n${i}`} c={c} i={i + 7} />,
          )}
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
          {held && <Octopus on={chain.has(ARM.id)} start={flowStart} party={party} blows={blows} />}
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
          const isHeld = n.tool.key === held?.key
          const cls = `tbx-node tbx-node--${n.tool.status}${isHeld ? ' tbx-node--held' : ''}${on ? ' is-on' : ''}`
          // The held tool buds last, once the arm is out of the rock.
          const style = { left: `${(n.at.x / W) * 100}%`, top: `${(n.at.y / H) * 100}%`, '--i': isHeld ? 7 : i } as CSSProperties
          const pick = () => {
            if (n.tool.key !== activeKey) setMoved(true)
            setActiveKey(n.tool.key)
          }
          const inner = (
            <>
              <span className="tbx-node__dot">
                {n.tool.icon && <img src={n.tool.icon} alt="" />}
                {isHeld && <Grip />}
              </span>
              <span className="tbx-node__name">
                {t(`tools.items.${n.tool.key}`)}
                {/* On event days the held tool says so, hand-lettered under its name. */}
                {isHeld && party && <span className="tbx-node__special">{t('tools.octopus.special')}</span>}
              </span>
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

        {party && (
          <button
            type="button"
            className="tbx-octo__poke"
            aria-label={t('tools.octopus.blow')}
            onClick={() => setBlows((b) => b + 1)}
            style={{
              left: `${(POKE.x / W) * 100}%`,
              top: `${(POKE.y / H) * 100}%`,
              width: `${(POKE.w / W) * 100}%`,
              height: `${(POKE.h / H) * 100}%`,
            }}
          />
        )}

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

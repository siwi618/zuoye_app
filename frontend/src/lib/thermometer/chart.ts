// Canvas drawing for the thermometer chart (4 channels on a clock-time axis), shared by the page
// and the PNG export. Each pixel column keeps a channel's min and max; a null (no probe) breaks the line.
import { type Unit, fromCelsius } from './protocol'

export type ChartData = {
  times: number[] // ms since epoch, ascending
  temps: (number | null)[][] // per sample: T1–T4 in °C
  visible: boolean[]
  /** Show only the last N seconds; null = everything. */
  windowSec: number | null
  unit: Unit
  yLabel: string
}

export type Colors = { channels: string[]; ink: string; grid: string }

/** T1 follows the site's primary color; the others are fixed so they read in both themes. */
export const CHANNEL_COLORS = ['var(--primary)', '#e8743b', '#4a78d6', '#9b5cc4']

export function resolveChannelColors(el: Element): string[] {
  const primary = getComputedStyle(el).getPropertyValue('--primary').trim()
  return CHANNEL_COLORS.map((c) => (c === 'var(--primary)' ? primary : c))
}

export function setup(canvas: HTMLCanvasElement, w: number, h: number, dpr: number) {
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

/** The chart as a PNG: same window and unit as on screen, light colors on white. */
export function chartPng(data: ChartData, w = 1200, h = 600): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  const ctx = setup(canvas, w, h, 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.translate(16, 16)
  const channels = resolveChannelColors(document.documentElement)
  drawChart(ctx, w - 32, h - 32, { channels, ink: '#64748b', grid: '#e2e8f0' }, data)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colors: Colors,
  { times, temps, visible, windowSec, unit, yLabel }: ChartData,
) {
  const { ink, grid } = colors
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  const n = times.length
  const last = n ? times[n - 1] : Date.now()
  const first = n ? times[0] : last
  // A window fills from the left until the data is longer than it, then scrolls
  const x0 = windowSec === null ? first : Math.max(first, last - windowSec * 1000)
  const x1 =
    windowSec === null
      ? Math.max(last, x0 + 1000)
      : x0 + windowSec * 1000 < last
        ? last
        : x0 + windowSec * 1000
  let lo = 0
  if (windowSec !== null) {
    let hi = n
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (times[m] < x0) lo = m + 1
      else hi = m
    }
  }

  let yMin = Infinity
  let yMax = -Infinity
  for (let k = lo; k < n; k++) {
    for (let c = 0; c < 4; c++) {
      const v = temps[k][c]
      if (v === null || !visible[c]) continue
      const y = fromCelsius(v, unit)
      if (y < yMin) yMin = y
      if (y > yMax) yMax = y
    }
  }
  if (!Number.isFinite(yMin)) {
    yMin = fromCelsius(15, unit)
    yMax = fromCelsius(30, unit)
  }
  if (yMax - yMin < 1) {
    // at least 1 degree tall so the 0.1° steps don't fill the chart
    const mid = (yMax + yMin) / 2
    yMin = mid - 0.5
    yMax = mid + 0.5
  }
  const pad = (yMax - yMin) * 0.08
  yMin -= pad
  yMax += pad

  const yTicks = niceTicks(yMin, yMax, Math.max(3, Math.floor(h / 50)))
  const yLabels = yTicks.map((v) => formatTick(v, yTicks))
  const left = Math.max(...yLabels.map((s) => ctx.measureText(s).width)) + 28
  const right = 12
  const top = 10
  const bottom = 26
  const pw = w - left - right
  const ph = h - top - bottom
  const px = (x: number) => left + ((x - x0) / (x1 - x0)) * pw
  const py = (y: number) => top + (1 - (y - yMin) / (yMax - yMin)) * ph

  ctx.strokeStyle = grid
  ctx.fillStyle = ink
  ctx.lineWidth = 1
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  yTicks.forEach((v, k) => {
    const y = Math.round(py(v)) + 0.5
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(left + pw, y)
    ctx.stroke()
    ctx.fillText(yLabels[k], left - 6, y)
  })
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const v of timeTicks(x0, x1, Math.max(2, Math.floor(pw / 110)))) {
    ctx.fillText(clock(v, x1 - x0), px(v), top + ph + 6)
  }
  ctx.save()
  ctx.translate(11, top + ph / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textBaseline = 'middle'
  ctx.fillText(yLabel, 0, 0)
  ctx.restore()

  if (n - lo < 1) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(left, top, pw, ph)
  ctx.clip()
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  for (let c = 0; c < 4; c++) {
    if (!visible[c]) continue
    ctx.strokeStyle = colors.channels[c]
    ctx.beginPath()
    let pen = false // false = next point starts a new piece (after a gap)
    let k = lo
    while (k < n) {
      const col = Math.floor(px(times[k]))
      let mn: number | null = null
      let mx: number | null = null
      let kMin = -1
      let kMax = -1
      let j = k
      let gap = false
      while (j < n && Math.floor(px(times[j])) === col) {
        const v = temps[j][c]
        if (v === null) gap = true
        else {
          if (mn === null || v < mn) {
            mn = v
            kMin = j
          }
          if (mx === null || v > mx) {
            mx = v
            kMax = j
          }
        }
        j++
      }
      if (mn === null || mx === null) {
        pen = false
      } else {
        // in time order, so the line goes down then up (or up then down) as it really did
        const ys = mn === mx ? [mn] : kMin <= kMax ? [mn, mx] : [mx, mn]
        const x = j - k === 1 ? px(times[k]) : col
        for (const v of ys) {
          const y = py(fromCelsius(v, unit))
          if (pen) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
          pen = true
        }
        if (gap) pen = false
      }
      k = j
    }
    ctx.stroke()
  }
  ctx.restore()
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min
  if (span <= 0) return [min]
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  }
  return out
}

function formatTick(v: number, ticks: number[]): string {
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : Math.abs(v) || 1
  const exp = Math.floor(Math.log10(step) + 1e-9)
  const mantissa = step / 10 ** exp
  const digits = Math.max(0, -exp + (Math.abs(mantissa - 2.5) < 1e-6 ? 1 : 0))
  return v.toFixed(Math.min(digits, 6))
}

const STEPS_S = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400,
]

/** Round clock times (local) between a and b, about `count` of them. */
function timeTicks(a: number, b: number, count: number): number[] {
  const raw = (b - a) / 1000 / count
  const step = (STEPS_S.find((s) => s >= raw) ?? 86400) * 1000
  const tz = new Date(a).getTimezoneOffset() * 60000
  const out: number[] = []
  for (let v = Math.ceil((a - tz) / step) * step + tz; v <= b; v += step) out.push(v)
  return out
}

function clock(ms: number, span: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`
  if (span > 2 * 86400000) return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
  return span > 3 * 3600000 ? hm : `${hm}:${p(d.getSeconds())}`
}

// Canvas drawing for the ammeter chart, shared by the live view and the PNG export.

export type ChartData = {
  t: number[] // seconds
  i: number[] // amperes
  /** Show only the last N seconds; null = everything. */
  windowSec: number | null
  milli: boolean
  xLabel: string
  yLabel: string
}

export type Colors = { line: string; ink: string; grid: string }

export function setup(canvas: HTMLCanvasElement, w: number, h: number, dpr: number) {
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

/** The chart as a PNG: same window and unit as on screen, light colors on white whatever the theme. */
export function chartPng(
  { t, i, windowSec, milli, xLabel, yLabel }: ChartData,
  w = 1200,
  h = 600,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  const ctx = setup(canvas, w, h, 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  const line = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
  ctx.translate(16, 16)
  drawChart(
    ctx,
    w - 32,
    h - 32,
    { line, ink: '#64748b', grid: '#e2e8f0' },
    t,
    i,
    windowSec,
    milli ? 1000 : 1,
    xLabel,
    yLabel,
  )
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colors: Colors,
  t: number[],
  i: number[],
  windowSec: number | null,
  scale: number,
  xLabel: string,
  yLabel: string,
) {
  const { line, ink, grid } = colors
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'

  const n = t.length
  const end = Math.max(n ? t[n - 1] : 0, windowSec ?? 0, 0.001)
  const x0 = windowSec === null ? 0 : Math.max(0, end - windowSec)
  let lo = 0
  if (windowSec !== null) {
    let hi = n
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (t[m] < x0) lo = m + 1
      else hi = m
    }
  }

  let yMin = Infinity
  let yMax = -Infinity
  for (let k = lo; k < n; k++) {
    yMin = Math.min(yMin, i[k] * scale)
    yMax = Math.max(yMax, i[k] * scale)
  }
  if (!Number.isFinite(yMin)) {
    yMin = 0
    yMax = 0.1 * scale
  }
  const minSpan = 0.001 * scale // at least 1 mA tall so quantization noise doesn't fill the chart
  if (yMax - yMin < minSpan) {
    const mid = (yMax + yMin) / 2
    yMin = mid - minSpan / 2
    yMax = mid + minSpan / 2
  }
  const pad = (yMax - yMin) * 0.08
  yMin -= pad
  yMax += pad

  const yTicks = niceTicks(yMin, yMax, Math.max(3, Math.floor(h / 50)))
  const yLabels = yTicks.map((v) => formatTick(v, yTicks))
  const left = Math.max(...yLabels.map((s) => ctx.measureText(s).width)) + 28
  const right = 12
  const top = 10
  const bottom = 40
  const pw = w - left - right
  const ph = h - top - bottom
  const px = (x: number) => left + ((x - x0) / (end - x0)) * pw
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
  const xTicks = niceTicks(x0, end, Math.max(2, Math.floor(pw / 90)))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  xTicks.forEach((v) => {
    ctx.fillText(formatTick(v, xTicks), px(v), top + ph + 6)
  })
  ctx.fillText(xLabel, left + pw / 2, top + ph + 22)
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
  ctx.strokeStyle = line
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const perPixel = (n - lo) / pw
  if (perPixel <= 2) {
    for (let k = lo; k < n; k++) {
      const x = px(t[k])
      const y = py(i[k] * scale)
      if (k === lo) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
  } else {
    // one column per pixel: draw down to its min and up to its max, in time order
    let k = lo
    let first = true
    while (k < n) {
      const col = Math.floor(px(t[k]))
      let mn = i[k]
      let mx = i[k]
      let mnFirst = true
      let j = k + 1
      while (j < n && Math.floor(px(t[j])) === col) {
        if (i[j] < mn) {
          mn = i[j]
          mnFirst = false
        }
        if (i[j] > mx) {
          mx = i[j]
          mnFirst = true
        }
        j++
      }
      const ys = mnFirst ? [mn, mx] : [mx, mn]
      for (const v of ys) {
        if (first) ctx.moveTo(col, py(v * scale))
        else ctx.lineTo(col, py(v * scale))
        first = false
      }
      k = j
    }
  }
  ctx.stroke()
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

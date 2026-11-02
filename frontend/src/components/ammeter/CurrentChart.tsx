import { useEffect, useRef } from 'react'
import { type ChartData, drawChart, setup } from '@/lib/ammeter/chart'

type Props = ChartData & {
  /** Bumped by the parent whenever t/i changed, to trigger a redraw. */
  version: number
}

/** Line chart drawn on a canvas: fast enough for 100 points/s; each pixel column keeps min + max. */
export function CurrentChart({ t, i, windowSec, milli, xLabel, yLabel, version }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || !h) return
      const css = getComputedStyle(canvas)
      const color = (name: string) => css.getPropertyValue(name).trim()
      const ctx = setup(canvas, w, h, window.devicePixelRatio || 1)
      const colors = {
        line: color('--primary'),
        ink: color('--muted-foreground'),
        grid: color('--border'),
      }
      drawChart(ctx, w, h, colors, t, i, windowSec, milli ? 1000 : 1, xLabel, yLabel)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    // colors come from CSS variables, which change when the theme class on <html> changes
    const mo = new MutationObserver(draw)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [t, i, windowSec, milli, xLabel, yLabel, version])

  return <canvas ref={canvasRef} className="block h-full w-full" />
}

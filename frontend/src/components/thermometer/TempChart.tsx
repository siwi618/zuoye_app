import { useEffect, useRef } from 'react'
import { type ChartData, drawChart, resolveChannelColors, setup } from '@/lib/thermometer/chart'

type Props = ChartData & {
  /** Bumped by the parent whenever the data arrays changed, to trigger a redraw. */
  version: number
}

/** Four temperature lines on a canvas; colors come from CSS variables so it follows the theme. */
export function TempChart({ times, temps, visible, windowSec, unit, yLabel, version }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || !h) return
      const css = getComputedStyle(canvas)
      const ctx = setup(canvas, w, h, window.devicePixelRatio || 1)
      drawChart(
        ctx,
        w,
        h,
        {
          channels: resolveChannelColors(canvas),
          ink: css.getPropertyValue('--muted-foreground').trim(),
          grid: css.getPropertyValue('--border').trim(),
        },
        { times, temps, visible, windowSec, unit, yLabel },
      )
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    const mo = new MutationObserver(draw)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [times, temps, visible, windowSec, unit, yLabel, version])

  return <canvas ref={canvasRef} className="block h-full w-full" />
}

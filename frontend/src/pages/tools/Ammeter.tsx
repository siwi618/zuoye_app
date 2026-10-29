import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileUp,
  HelpCircle,
  Play,
  Plug,
  Square,
  TriangleAlert,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CurrentChart } from '@/components/ammeter/CurrentChart'
import { Acquisition } from '@/lib/ammeter/acquisition'
import { CH340_VENDOR_ID } from '@/lib/ammeter/protocol'
import { parseLds } from '@/lib/ammeter/lds'
import { cn } from '@/lib/utils'

const PERIODS_MS = [1000, 500, 200, 100, 50, 25, 20, 10]
const WINDOWS: (number | null)[] = [10, 30, 60, null]
const MAC_APP = { href: '/downloads/DISPRO-Mac.zip', size: '1.0 MB' }
const DRIVER_URL = 'https://www.wch.cn/downloads/CH341SER_EXE.html'

const ua = navigator.userAgent
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
const isMobile = isIOS || /Android/.test(ua)
const isWindows = /Windows/.test(ua)
const isMac = /Macintosh/.test(ua) && !isIOS
const serial = navigator.serial

type Status = { key: string; params?: Record<string, string | number> }

/** What the page renders, copied out of the mutable sample store on each refresh. */
type View = {
  t: number[]
  i: number[]
  n: number
  min: number
  max: number
  sum: number
  hasRaw: boolean
  version: number
}

export function Ammeter() {
  const { t } = useTranslation()

  const [port, setPort] = useState<SerialPort | null>(null)
  const [periodMs, setPeriodMs] = useState(50)
  const [running, setRunning] = useState(false)
  const [windowSec, setWindowSec] = useState<number | null>(10)
  const [milli, setMilli] = useState(false)
  const [offset, setOffset] = useState(0)
  const [source, setSource] = useState('')
  const [status, setStatus] = useState<Status>({ key: 'ready' })
  const [showHelp, setShowHelp] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [view, setView] = useState<View>({
    t: [],
    i: [],
    n: 0,
    min: 0,
    max: 0,
    sum: 0,
    hasRaw: false,
    version: 0,
  })

  // Samples arrive in refs (up to 100 points/s); refresh() copies a snapshot into `view`.
  const data = useRef({ t: [] as number[], i: [] as number[], min: 0, max: 0, sum: 0 })
  const recentRaw = useRef<number[]>([])
  const offsetRef = useRef(0)
  const acq = useRef<Acquisition | null>(null)
  const timing = useRef({ periodS: 0.05, startedAt: 0, lastDataAt: 0 })
  const unsaved = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Reuse a CH340 the user already allowed on this site; follow plug / unplug.
  useEffect(() => {
    if (!serial) return
    const pick = async () => {
      const ports = await serial.getPorts()
      setPort((cur) =>
        cur && ports.includes(cur)
          ? cur
          : (ports.find((p) => p.getInfo().usbVendorId === CH340_VENDOR_ID) ?? null),
      )
    }
    pick()
    serial.addEventListener('connect', pick)
    serial.addEventListener('disconnect', pick)
    return () => {
      serial.removeEventListener('connect', pick)
      serial.removeEventListener('disconnect', pick)
    }
  }, [])

  // Stop the device when leaving the page; warn before closing the tab with data on screen.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (acq.current || (unsaved.current && data.current.t.length)) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      acq.current?.stop()
    }
  }, [])

  const refresh = useCallback(() => {
    const d = data.current
    const snap = {
      t: d.t,
      i: d.i,
      n: d.t.length,
      min: d.min,
      max: d.max,
      sum: d.sum,
      hasRaw: recentRaw.current.length > 0,
    }
    setView((v) => ({ ...snap, version: v.version + 1 }))
  }, [])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const now = performance.now()
      const { startedAt, lastDataAt } = timing.current
      if (now - lastDataAt > 2000) setStatus({ key: 'noData' })
      else if (now - startedAt > 1000) {
        const rate = data.current.t.length / ((now - startedAt) / 1000)
        setStatus({ key: 'running', params: { rate: rate.toFixed(1) } })
      }
      refresh()
    }, 100)
    return () => clearInterval(id)
  }, [running, refresh])

  const reset = () => {
    data.current = { t: [], i: [], min: 0, max: 0, sum: 0 }
    recentRaw.current = []
  }

  const onValues = useCallback((values: number[]) => {
    const d = data.current
    timing.current.lastDataAt = performance.now()
    for (const raw of values) {
      recentRaw.current.push(raw)
      const n = d.t.length
      const i = raw - offsetRef.current
      d.t.push((n + 1) * timing.current.periodS)
      d.i.push(i)
      d.min = n === 0 ? i : Math.min(d.min, i)
      d.max = n === 0 ? i : Math.max(d.max, i)
      d.sum += i
    }
    if (recentRaw.current.length > 10) recentRaw.current.splice(0, recentRaw.current.length - 10)
  }, [])

  const choosePort = async (): Promise<SerialPort | null> => {
    try {
      const p = await serial!.requestPort({ filters: [{ usbVendorId: CH340_VENDOR_ID }] })
      setPort(p)
      setShowHelp(false)
      return p
    } catch {
      // cancelled, or nothing to choose from: most likely a missing driver / loose cable
      setShowHelp(true)
      return null
    }
  }

  const start = async () => {
    setConfirmDiscard(false)
    const p = port ?? (await choosePort())
    if (!p) return
    const a = new Acquisition(p, periodMs * 1000, onValues, () => {
      acq.current = null
      setRunning(false)
      setStatus({ key: 'stopped', params: { n: data.current.t.length } })
      refresh()
      toast.error(t('tools.ammeter.errors.disconnected'), { duration: 10000 })
    })
    reset()
    timing.current = {
      periodS: periodMs / 1000,
      startedAt: performance.now(),
      lastDataAt: performance.now(),
    }
    try {
      await a.start()
    } catch (e) {
      toast.error(t('tools.ammeter.errors.openFailed', { msg: (e as Error).message }), {
        duration: 10000,
      })
      return
    }
    acq.current = a
    setSource('')
    unsaved.current = true
    setRunning(true)
    setStatus({ key: 'starting' })
    refresh()
  }

  const requestStart = () => {
    if (unsaved.current && data.current.t.length) setConfirmDiscard(true)
    else start()
  }

  const stop = async () => {
    const a = acq.current
    if (!a) return
    acq.current = null
    await a.stop()
    setRunning(false)
    setStatus({ key: 'stopped', params: { n: data.current.t.length } })
    refresh()
  }

  const zero = () => {
    const r = recentRaw.current
    if (!r.length) return
    offsetRef.current = r.reduce((a, b) => a + b, 0) / r.length
    setOffset(offsetRef.current)
  }

  const clearZero = () => {
    offsetRef.current = 0
    setOffset(0)
  }

  const openLds = async (file: File) => {
    try {
      const { t: times, i } = parseLds(await file.text())
      data.current = {
        t: times,
        i,
        min: i.reduce((a, b) => Math.min(a, b), Infinity),
        max: i.reduce((a, b) => Math.max(a, b), -Infinity),
        sum: i.reduce((a, b) => a + b, 0),
      }
      recentRaw.current = []
      setSource(file.name)
      unsaved.current = false
      setStatus({ key: 'opened', params: { name: file.name, n: times.length } })
      refresh()
    } catch {
      toast.error(t('tools.ammeter.errors.ldsFailed', { name: file.name }))
    }
  }

  const exportCsv = () => {
    const d = data.current
    const lines = ['﻿' + t('tools.ammeter.csvHeader')]
    for (let k = 0; k < d.t.length; k++)
      lines.push(`${d.t[k].toFixed(3)},${+d.i[k].toPrecision(7)}`)
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' })
    const stamp = new Date(timing.current.startedAt + performance.timeOrigin)
    const pad = (n: number) => String(n).padStart(2, '0')
    const name = source
      ? source.replace(/\.lds$/i, '') + '.csv'
      : `${t('tools.ammeter.csvPrefix')}_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.csv`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
    unsaved.current = false
    setStatus({ key: 'exported', params: { name } })
  }

  const d = view
  const n = view.n
  const unit = milli ? 'mA' : 'A'
  const fmt = (a: number) => (milli ? `${(a * 1000).toFixed(2)} mA` : `${a.toFixed(4)} A`)
  const canZero = running && view.hasRaw

  return (
    <div className="space-y-6">
      <Link
        to="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('tools.title')}
      </Link>

      <header className="flex items-center gap-4">
        <img src="/tools/ammeter.svg" alt="" className="size-14 shrink-0" />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('tools.items.ammeter')}</h1>
          <p className="text-muted-foreground">{t('tools.ammeter.subtitle')}</p>
        </div>
      </header>

      {!serial && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlert className="size-5 shrink-0" />
          <div className="flex-1 space-y-0.5">
            <p className="font-medium">{t('tools.ammeter.unsupported.title')}</p>
            <p>
              {t(
                isMobile ? 'tools.ammeter.unsupported.mobile' : 'tools.ammeter.unsupported.desktop',
              )}
            </p>
          </div>
          {isMac && (
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <a href={MAC_APP.href} download>
                <Download className="size-4" />
                {t('tools.ammeter.macApp.download', { size: MAC_APP.size })}
              </a>
            </Button>
          )}
        </div>
      )}

      <Card className="py-0">
        <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
          {serial && (
            <>
              <Button variant="outline" onClick={choosePort} disabled={running}>
                <Plug className="size-4" />
                {port ? t('tools.ammeter.changeDevice') : t('tools.ammeter.connect')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('tools.ammeter.help.title')}
                title={t('tools.ammeter.help.title')}
                onClick={() => setShowHelp((s) => !s)}
              >
                <HelpCircle className="size-4" />
              </Button>
            </>
          )}
          <Select
            value={String(periodMs)}
            onValueChange={(v) => setPeriodMs(Number(v))}
            disabled={running || !serial}
          >
            <SelectTrigger className="w-[190px]" aria-label={t('tools.ammeter.period')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS_MS.map((ms) => (
                <SelectItem key={ms} value={String(ms)}>
                  {t('tools.ammeter.periodOption', { ms, n: 1000 / ms })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={running ? stop : requestStart}
            disabled={!serial}
            variant={running ? 'destructive' : 'default'}
            className="w-24"
          >
            {running ? <Square className="size-4" /> : <Play className="size-4" />}
            {running ? t('tools.ammeter.stop') : t('tools.ammeter.start')}
          </Button>
          <Button variant="secondary" onClick={zero} disabled={!canZero}>
            {t('tools.ammeter.zero')}
          </Button>
          {offset !== 0 && (
            <Button variant="ghost" onClick={clearZero}>
              {t('tools.ammeter.clearZero')}
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={running}>
              <FileUp className="size-4" />
              {t('tools.ammeter.openLds')}
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={running || n === 0}>
              <Download className="size-4" />
              {t('tools.ammeter.exportCsv')}
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".lds"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) openLds(f)
              e.target.value = ''
            }}
          />
        </CardContent>
      </Card>

      {showHelp && serial && <DeviceHelp />}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="py-0">
          <CardContent className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="truncate text-sm text-muted-foreground">
                {source || t('tools.ammeter.current')}
              </p>
              <p className="text-4xl font-semibold tabular-nums tracking-tight">
                {n ? fmt(d.i[n - 1]) : '—'}
              </p>
              <Segmented
                options={[
                  { value: false, label: 'A' },
                  { value: true, label: 'mA' },
                ]}
                value={milli}
                onChange={setMilli}
              />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {[
                ['min', n ? fmt(d.min) : '—'],
                ['max', n ? fmt(d.max) : '—'],
                ['mean', n ? fmt(d.sum / n) : '—'],
                ['count', String(n)],
                ['duration', `${(n ? d.t[n - 1] : 0).toFixed(2)} s`],
                ...(offset !== 0 ? [['offset', fmt(offset)]] : []),
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{t(`tools.ammeter.stats.${k}`)}</dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardContent className="flex h-[420px] flex-col gap-2 p-4">
            <div className="flex justify-end">
              <Segmented
                options={WINDOWS.map((w) => ({
                  value: w,
                  label:
                    w === null
                      ? t('tools.ammeter.windowAll')
                      : t('tools.ammeter.windowSec', { n: w }),
                }))}
                value={windowSec}
                onChange={setWindowSec}
              />
            </div>
            <div className="relative min-h-0 flex-1">
              <CurrentChart
                t={d.t}
                i={d.i}
                windowSec={windowSec}
                milli={milli}
                xLabel={t('tools.ammeter.timeAxis')}
                yLabel={t('tools.ammeter.currentAxis', { unit })}
                version={view.version}
              />
              {n === 0 && (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {t('tools.ammeter.empty')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={cn('size-2 rounded-full', running ? 'bg-primary' : 'bg-muted-foreground/40')}
        />
        <span>{t(`tools.ammeter.status.${status.key}`, status.params)}</span>
        {serial && (
          <span className="ml-auto">
            {port ? t('tools.ammeter.deviceReady') : t('tools.ammeter.noDevice')}
          </span>
        )}
      </div>

      {!isMobile && (
        <Card className="py-0">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-1">
              <h2 className="font-semibold">{t('tools.ammeter.macApp.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('tools.ammeter.macApp.description')}
              </p>
              <p className="text-xs text-muted-foreground">{t('tools.ammeter.macApp.note')}</p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <a href={MAC_APP.href} download>
                <Download className="size-4" />
                {t('tools.ammeter.macApp.download', { size: MAC_APP.size })}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tools.ammeter.discard.title')}</DialogTitle>
            <DialogDescription>{t('tools.ammeter.discard.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              {t('tools.ammeter.discard.cancel')}
            </Button>
            <Button variant="destructive" onClick={start}>
              {t('tools.ammeter.discard.discard')}
            </Button>
            <Button
              onClick={() => {
                exportCsv()
                setConfirmDiscard(false)
              }}
            >
              {t('tools.ammeter.discard.export')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DeviceHelp() {
  const { t } = useTranslation()
  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-5 text-sm">
        <h2 className="font-semibold">{t('tools.ammeter.help.title')}</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t('tools.ammeter.help.usb')}</li>
          <li>{t('tools.ammeter.help.busy')}</li>
          {isMac && <li>{t('tools.ammeter.help.mac')}</li>}
        </ul>
        {isWindows && (
          <div className="space-y-2 rounded-lg bg-secondary/70 p-4">
            <p className="font-medium">{t('tools.ammeter.help.windowsTitle')}</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>{t('tools.ammeter.help.windowsStep1')}</li>
              <li>{t('tools.ammeter.help.windowsStep2')}</li>
              <li>{t('tools.ammeter.help.windowsStep3')}</li>
            </ol>
            <Button asChild size="sm">
              <a href={DRIVER_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                {t('tools.ammeter.help.driverButton')}
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Segmented<T>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-secondary p-0.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            o.value === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

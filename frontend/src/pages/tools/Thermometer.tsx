import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ChevronDown,
  Download,
  ExternalLink,
  FileSpreadsheet,
  HelpCircle,
  ImageIcon,
  Plug,
  RefreshCw,
  Table2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TempChart } from '@/components/thermometer/TempChart'
import { CHANNEL_COLORS, chartPng } from '@/lib/thermometer/chart'
import { RecordsError, Thermometer as Meter } from '@/lib/thermometer/device'
import { type ExportRow, fileStamp, formatTime, toCsv, toXlsx } from '@/lib/thermometer/export'
import {
  CH340_VENDOR_ID,
  type Live,
  type MeterRecord,
  type MeterStatus,
  STAT_LABELS,
  type Segment,
  UNITS,
  UNIT_SYMBOL,
  type Unit,
  fromCelsius,
  parsePages,
  splitSegments,
  typeName,
} from '@/lib/thermometer/protocol'
import { cn } from '@/lib/utils'

const WINDOWS: (number | null)[] = [60, 300, 1800, null]
const MAX_SAMPLES = 300_000 // about 28 hours at ~3 frames/s
const MAC_APP = { href: '/downloads/UT325F-Mac.zip', size: '1.2 MB' }
const DRIVER_URL = 'https://www.wch.cn/downloads/CH341SER_EXE.html'
const CHANNELS = ['T1', 'T2', 'T3', 'T4']

const ua = navigator.userAgent
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
const isMobile = isIOS || /Android/.test(ua)
const isWindows = /Windows/.test(ua)
const isMac = /Macintosh/.test(ua) && !isIOS
const serial = navigator.serial

type LinkState = 'none' | 'listening' | 'connected' | 'notDevice' | 'lost' | 'busy'
type Tab = 'live' | 'records'

type Stats = { min: number; max: number; sum: number; n: number }
const emptyStats = (): Stats[] =>
  [0, 1, 2, 3].map(() => ({ min: Infinity, max: -Infinity, sum: 0, n: 0 }))

function statsOf(rows: { temps: (number | null)[] }[]): Stats[] {
  const s = emptyStats()
  for (const r of rows) {
    r.temps.forEach((v, c) => {
      if (v === null) return
      s[c].min = Math.min(s[c].min, v)
      s[c].max = Math.max(s[c].max, v)
      s[c].sum += v
      s[c].n++
    })
  }
  return s
}

export function Thermometer() {
  const { t } = useTranslation()

  const [port, setPort] = useState<SerialPort | null>(null)
  const [linkState, setLink] = useState<LinkState>('none')
  const [busyMsg, setBusyMsg] = useState('')
  const [tab, setTab] = useState<Tab>('live')
  const [unit, setUnit] = useState<Unit>('C')
  const [visible, setVisible] = useState([true, true, true, true])
  const [windowSec, setWindowSec] = useState<number | null>(300)
  const [showHelp, setShowHelp] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [exported, setExported] = useState('')

  // Live samples arrive in refs (~3/s); the 250 ms tick copies what the page shows.
  const live = useRef({
    times: [] as number[],
    temps: [] as (number | null)[][],
    stats: emptyStats(),
  })
  const [latest, setLatest] = useState<{ live: Live; at: number } | null>(null)
  const [meterStatus, setMeterStatus] = useState<MeterStatus | null>(null)
  // What the page renders, copied out of the ref on each tick (arrays are shared, version redraws)
  const [view, setView] = useState({
    times: [] as number[],
    temps: [] as (number | null)[][],
    stats: emptyStats(),
    n: 0,
    version: 0,
  })

  // Records read from the meter
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null)
  const [records, setRecords] = useState<{
    list: MeterRecord[]
    segments: Segment[]
    at: Date
  } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const meter = useRef<Meter | null>(null)
  // Ports that sent nothing a UT325F would: skipped when picking a port automatically
  const notDevice = useRef(new Set<SerialPort>())

  // ---- Connection: listen only; the meter must prove it is a UT325F before anything is written ----

  const connect = useCallback(async (p: SerialPort) => {
    await meter.current?.close()
    meter.current = null
    setLatest(null)
    setMeterStatus(null)
    const m = new Meter(p, {
      onLive: (l, at) => {
        const d = live.current
        d.times.push(at)
        d.temps.push(l.temps)
        l.temps.forEach((v, c) => {
          if (v === null) return
          const s = d.stats[c]
          s.min = Math.min(s.min, v)
          s.max = Math.max(s.max, v)
          s.sum += v
          s.n++
        })
        if (d.times.length > MAX_SAMPLES) {
          d.times.splice(0, d.times.length - MAX_SAMPLES)
          d.temps.splice(0, d.temps.length - MAX_SAMPLES)
          d.stats = statsOf(d.temps.map((temps) => ({ temps })))
        }
        setLatest({ live: l, at })
      },
      onStatus: (s) => {
        setMeterStatus(s)
        if (s.unit) setUnit(s.unit) // follow the unit chosen on the meter
      },
      onLost: () => {
        if (meter.current === m) meter.current = null
        setLink('lost')
        setReading(null)
      },
    })
    try {
      await m.open()
    } catch (e) {
      setBusyMsg((e as Error).message)
      setLink('busy')
      return
    }
    meter.current = m
    setLink('listening')
    const ok = await m.verified
    if (meter.current !== m) return
    if (ok) {
      notDevice.current.delete(p)
      setLink('connected')
    } else {
      notDevice.current.add(p)
      await m.close()
      if (meter.current === m) meter.current = null
      setLink('notDevice')
    }
  }, [])

  // Connect whenever the chosen port changes (from a callback, so the effect itself sets no state)
  useEffect(() => {
    if (!port) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) connect(port)
    })
    return () => {
      cancelled = true
    }
  }, [port, connect])

  // Reuse a CH340 the user already allowed on this site (but not one that proved to be something
  // else); follow plug / unplug.
  useEffect(() => {
    if (!serial) return
    const pick = async () => {
      const ports = (await serial.getPorts()).filter(
        (p) => p.getInfo().usbVendorId === CH340_VENDOR_ID,
      )
      setPort((cur) =>
        cur && ports.includes(cur) ? cur : (ports.find((p) => !notDevice.current.has(p)) ?? null),
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

  // Close the port when leaving the page; warn before closing the tab with unexported live data.
  const unsaved = useRef(false)
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsaved.current && live.current.times.length > 30) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      meter.current?.close()
    }
  }, [])

  const refresh = useCallback(() => {
    const d = live.current
    setView((v) => ({
      times: d.times,
      temps: d.temps,
      stats: d.stats.map((s) => ({ ...s })),
      n: d.times.length,
      version: v.version + 1,
    }))
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
      refresh()
      if (live.current.times.length) unsaved.current = true
    }, 250)
    return () => clearInterval(id)
  }, [refresh])

  const choosePort = async () => {
    try {
      const p = await serial!.requestPort({ filters: [{ usbVendorId: CH340_VENDOR_ID }] })
      setShowHelp(false)
      notDevice.current.delete(p) // chosen by hand: check it again
      if (p === port) connect(p)
      else setPort(p)
    } catch {
      // cancelled, or nothing to choose from: most likely a missing driver / loose cable
      setShowHelp(true)
    }
  }

  const clearLive = () => {
    live.current = { times: [], temps: [], stats: emptyStats() }
    unsaved.current = false
    refresh()
  }

  // ---- Records ----

  const readRecords = async () => {
    const m = meter.current
    if (!m || link !== 'connected') return
    if (meterStatus?.recording) {
      toast.error(t('tools.thermometer.records.recording'), { duration: 10000 })
      return
    }
    setReading({ done: 0, total: 0 })
    try {
      const pages = await m.readRecords((done, total) => setReading({ done, total }))
      const { records: list, bad } = parsePages(pages)
      const segments = splitSegments(list)
      setRecords({ list, segments, at: new Date() })
      setSelected(segments.length ? segments[segments.length - 1].id : null)
      if (bad) toast.warning(t('tools.thermometer.records.badSkipped', { n: bad }))
    } catch (e) {
      const reason = e instanceof RecordsError ? e.reason : 'interrupted'
      toast.error(t(`tools.thermometer.records.${reason}`), { duration: 10000 })
    } finally {
      setReading(null)
    }
  }

  const segment = records?.segments.find((s) => s.id === selected) ?? null

  // ---- Export ----

  const download = (blob: Blob, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
    setExported(name)
  }

  const exportRows = (rows: ExportRow[], kind: 'xlsx' | 'csv', name: string) => {
    if (!rows.length) return
    if (kind === 'xlsx') download(toXlsx(rows, unit), `${name}.xlsx`)
    else
      download(
        toCsv(rows, unit, {
          no: t('tools.thermometer.csvNo'),
          time: t('tools.thermometer.csvTime'),
        }),
        `${name}.csv`,
      )
  }

  const liveRows = (): ExportRow[] =>
    live.current.times.map((ms, k) => ({ time: new Date(ms), temps: live.current.temps[k] }))

  const recordRows = (list: MeterRecord[]): ExportRow[] =>
    list.map((r) => ({ time: r.time, temps: r.temps, types: r.types.map(typeName) }))

  const exportLive = (kind: 'xlsx' | 'csv' | 'png') => {
    const d = live.current
    if (!d.times.length) return
    const name = `${t('tools.thermometer.filePrefix.live')}_${fileStamp(new Date(d.times[0]))}`
    if (kind === 'png') {
      chartPng({ times: d.times, temps: d.temps, visible, windowSec, unit, yLabel: yLabel }).then(
        (blob) => blob && download(blob, `${name}.png`),
      )
      return
    }
    exportRows(liveRows(), kind, name)
    unsaved.current = false
  }

  const exportSegment = (kind: 'xlsx' | 'csv' | 'png') => {
    if (!segment) return
    const name = `${t('tools.thermometer.filePrefix.segment')}_${fileStamp(segment.records[0].time)}`
    if (kind === 'png') {
      chartPng({ ...chartData(segment), visible, windowSec: null, unit, yLabel }).then(
        (blob) => blob && download(blob, `${name}.png`),
      )
      return
    }
    exportRows(recordRows(segment.records), kind, name)
  }

  const exportAll = (kind: 'xlsx' | 'csv') => {
    if (!records) return
    exportRows(
      recordRows(records.list),
      kind,
      `${t('tools.thermometer.filePrefix.all')}_${fileStamp(records.at)}`,
    )
  }

  // ---- View ----

  const link: LinkState = port ? linkState : 'none'
  const sym = UNIT_SYMBOL[unit]
  const yLabel = t('tools.thermometer.tempAxis', { unit: sym })
  const fmt = (c: number | null | undefined) =>
    c === null || c === undefined ? '----' : fromCelsius(c, unit).toFixed(1)
  const l = latest?.live
  const n = view.n
  const silentS = latest ? Math.floor((now - latest.at) / 1000) : 0
  const flowing = link === 'connected' && latest !== null && silentS < 3
  const segmentStats = segment ? statsOf(segment.records) : null
  const segmentChart = segment ? chartData(segment) : null

  const status = (() => {
    if (exported && link !== 'lost' && link !== 'busy')
      return t('tools.thermometer.status.exported', { name: exported })
    switch (link) {
      case 'none':
        return t('tools.thermometer.status.none')
      case 'listening':
        return t('tools.thermometer.status.listening')
      case 'notDevice':
        return t('tools.thermometer.notDevice.title')
      case 'lost':
        return t('tools.thermometer.status.lost')
      case 'busy':
        return t('tools.thermometer.status.busy', { msg: busyMsg })
      case 'connected':
        if (meterStatus?.hold) return t('tools.thermometer.status.hold')
        if (latest && silentS >= 3) return t('tools.thermometer.status.silent', { s: silentS })
        return t('tools.thermometer.status.connected', { n })
    }
  })()

  // the "exported" note fades back to the connection status after a few seconds
  useEffect(() => {
    if (!exported) return
    const id = setTimeout(() => setExported(''), 4000)
    return () => clearTimeout(id)
  }, [exported])

  const unitPicker = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{t('tools.thermometer.unit')}</span>
      <Segmented
        options={UNITS.map((u) => ({ value: u, label: UNIT_SYMBOL[u] }))}
        value={unit}
        onChange={setUnit}
      />
    </div>
  )

  // What to say over the live chart when it has no line to draw (null = it has one)
  const liveHint = (() => {
    if (n === 0)
      return link === 'connected' || link === 'listening'
        ? t('tools.thermometer.waiting')
        : t('tools.thermometer.emptyLive')
    if (!visible.some(Boolean)) return t('tools.thermometer.noCurve.hidden')
    const from = windowSec === null ? -Infinity : view.times[n - 1] - windowSec * 1000
    let anyProbe = false
    for (let k = n - 1; k >= 0 && view.times[k] >= from; k--) {
      for (let c = 0; c < 4; c++) {
        if (view.temps[k][c] === null) continue
        if (visible[c]) return null
        anyProbe = true
      }
    }
    return anyProbe
      ? t('tools.thermometer.noCurve.unchecked')
      : t('tools.thermometer.noCurve.noProbe')
  })()

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
        <img src="/tools/thermometer.svg" alt="" className="size-14 shrink-0" />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('tools.items.thermometer')}</h1>
          <p className="text-muted-foreground">{t('tools.thermometer.subtitle')}</p>
        </div>
      </header>

      {!serial && (
        <Banner>
          <div className="flex-1 space-y-0.5">
            <p className="font-medium">{t('tools.thermometer.unsupported.title')}</p>
            <p>
              {t(
                isMobile
                  ? 'tools.thermometer.unsupported.mobile'
                  : 'tools.thermometer.unsupported.desktop',
              )}
            </p>
          </div>
          {isMac && (
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <a href={MAC_APP.href} download>
                <Download className="size-4" />
                {t('tools.thermometer.macApp.download', { size: MAC_APP.size })}
              </a>
            </Button>
          )}
        </Banner>
      )}

      <Card className="py-0">
        <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
          {serial && (
            <>
              <Button variant="outline" onClick={choosePort} disabled={reading !== null}>
                <Plug className="size-4" />
                {port ? t('tools.thermometer.changeDevice') : t('tools.thermometer.connect')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('tools.thermometer.help.title')}
                title={t('tools.thermometer.help.title')}
                onClick={() => setShowHelp((s) => !s)}
              >
                <HelpCircle className="size-4" />
              </Button>
            </>
          )}
          <Segmented
            options={(['live', 'records'] as Tab[]).map((v) => ({
              value: v,
              label: t(`tools.thermometer.tabs.${v}`),
            }))}
            value={tab}
            onChange={setTab}
            size="md"
          />
          <div className="ml-auto">
            {tab === 'live' ? (
              <ExportMenu
                disabled={n === 0}
                onSelect={exportLive}
                label={t('tools.thermometer.export')}
                png
                size="default"
              />
            ) : (
              <ExportMenu
                disabled={!records?.list.length}
                onSelect={(k) => k !== 'png' && exportAll(k)}
                label={t('tools.thermometer.records.exportAll')}
                size="default"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {showHelp && serial && <DeviceHelp onClose={() => setShowHelp(false)} />}

      {link === 'notDevice' && port && (
        <Banner>
          <div className="flex-1 space-y-0.5">
            <p className="font-medium">{t('tools.thermometer.notDevice.title')}</p>
            <p>{t('tools.thermometer.notDevice.body')}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => connect(port)}>
              <RefreshCw className="size-4" />
              {t('tools.thermometer.notDevice.retry')}
            </Button>
            <Button size="sm" variant="outline" onClick={choosePort}>
              <Plug className="size-4" />
              {t('tools.thermometer.changeDevice')}
            </Button>
          </div>
        </Banner>
      )}

      {tab === 'live' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_180px]">
            {CHANNELS.map((name, c) => {
              const v = l?.temps[c] ?? null
              const s = view.stats[c]
              return (
                <Card key={name} className={cn('py-0', l && !flowing && 'opacity-60')}>
                  <CardContent className="space-y-1.5 p-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: CHANNEL_COLORS[c] }}
                      />
                      <span className="font-medium">{name}</span>
                      {l && l.mode !== 0 && (
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {STAT_LABELS[l.mode]} {fmt(l.stats[c])}
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-4xl font-semibold tabular-nums tracking-tight',
                        l && v === null && 'text-muted-foreground',
                      )}
                    >
                      {l ? fmt(v) : '—'}
                      {v !== null && (
                        <span className="ml-1 text-base font-normal text-muted-foreground">
                          {sym}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs tabular-nums text-muted-foreground">
                      {l && v === null
                        ? t('tools.thermometer.noProbe')
                        : t('tools.thermometer.statLine', {
                            min: s.n ? fmt(s.min) : '—',
                            max: s.n ? fmt(s.max) : '—',
                            mean: s.n ? fmt(s.sum / s.n) : '—',
                          })}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
            <Card className="py-0">
              <CardContent className="space-y-1.5 p-4">
                <p className="text-sm text-muted-foreground">{t('tools.thermometer.ambient')}</p>
                <p className="text-xl font-semibold tabular-nums">
                  {l ? `${fmt(l.ambient)} ${sym}` : '—'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {meterStatus?.hold && <Badge tone="amber">HOLD</Badge>}
                  {meterStatus?.recording && <Badge tone="red">REC</Badge>}
                  {l && l.mode !== 0 && <Badge tone="blue">{STAT_LABELS[l.mode]}</Badge>}
                </div>
                {l && l.mode !== 0 && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {t('tools.thermometer.timer', { t: hms(l.timer) })}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="py-0">
            <CardContent className="flex h-[440px] flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <ChannelToggles visible={visible} onChange={setVisible} />
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Segmented
                    options={WINDOWS.map((w) => ({
                      value: w,
                      label:
                        w === null
                          ? t('tools.thermometer.windowAll')
                          : t('tools.thermometer.windowMin', { n: w / 60 }),
                    }))}
                    value={windowSec}
                    onChange={setWindowSec}
                  />
                  <Button variant="ghost" size="sm" onClick={clearLive} disabled={n === 0}>
                    {t('tools.thermometer.clear')}
                  </Button>
                  {unitPicker}
                </div>
              </div>
              <div className="relative min-h-0 flex-1">
                <TempChart
                  times={view.times}
                  temps={view.temps}
                  visible={visible}
                  windowSec={windowSec}
                  unit={unit}
                  yLabel={yLabel}
                  version={view.version}
                />
                {liveHint && (
                  <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    {liveHint}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="py-0">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={readRecords} disabled={link !== 'connected' || reading !== null}>
                <Download className="size-4" />
                {t('tools.thermometer.records.read')}
              </Button>
              {reading ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{
                        width: `${reading.total ? (reading.done / reading.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {reading.total
                    ? t('tools.thermometer.records.reading', reading)
                    : t('tools.thermometer.records.querying')}
                </div>
              ) : (
                records && (
                  <span className="text-sm text-muted-foreground">
                    {t('tools.thermometer.records.summary', {
                      n: records.list.length,
                      segments: records.segments.length,
                      time: formatTime(records.at).slice(11),
                    })}
                  </span>
                )
              )}
              <div className="ml-auto">{unitPicker}</div>
            </div>

            {!records || records.segments.length === 0 ? (
              <p className="py-16 text-center text-sm whitespace-pre-line text-muted-foreground">
                {records
                  ? t('tools.thermometer.records.none')
                  : t('tools.thermometer.records.empty')}
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <ul className="space-y-1 lg:max-h-[520px] lg:overflow-y-auto">
                  {[...records.segments].reverse().map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(s.id)}
                        className={cn(
                          'w-full rounded-lg px-3 py-2 text-left transition-colors',
                          s.id === selected ? 'bg-secondary' : 'hover:bg-secondary/60',
                        )}
                      >
                        <p className="text-sm tabular-nums">{formatTime(s.records[0].time)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('tools.thermometer.records.segmentLine', {
                            n: s.records.length,
                            interval: span(t, s.interval),
                            duration: span(
                              t,
                              (s.records[s.records.length - 1].time.getTime() -
                                s.records[0].time.getTime()) /
                                1000,
                            ),
                          })}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
                {segment && segmentStats && segmentChart ? (
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="space-y-0.5">
                        <p className="font-medium tabular-nums">
                          {formatTime(segment.records[0].time)} –{' '}
                          {formatTime(segment.records[segment.records.length - 1].time).slice(11)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('tools.thermometer.records.types', {
                            types: segment.records[0].types.map(typeName).join(' / '),
                          })}
                        </p>
                      </div>
                      <div className="ml-auto">
                        <ExportMenu
                          onSelect={exportSegment}
                          label={t('tools.thermometer.records.exportSegment')}
                          png
                        />
                      </div>
                    </div>
                    <table className="w-fit text-sm tabular-nums">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th />
                          {(['min', 'max', 'mean'] as const).map((k) => (
                            <th key={k} className="px-3 text-left font-normal">
                              {t(`tools.thermometer.stats.${k}`)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {segmentStats.map((s, c) => (
                          <tr key={c}>
                            <td className="pr-2 font-medium" style={{ color: CHANNEL_COLORS[c] }}>
                              {CHANNELS[c]}
                            </td>
                            {s.n ? (
                              <>
                                <td className="px-3">{fmt(s.min)}</td>
                                <td className="px-3">{fmt(s.max)}</td>
                                <td className="px-3">{fmt(s.sum / s.n)}</td>
                              </>
                            ) : (
                              <td colSpan={3} className="px-3 text-muted-foreground">
                                {t('tools.thermometer.noProbe')}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ChannelToggles visible={visible} onChange={setVisible} />
                    <div className="h-[340px]">
                      <TempChart
                        {...segmentChart}
                        visible={visible}
                        windowSec={null}
                        unit={unit}
                        yLabel={yLabel}
                        version={segment.id}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    {t('tools.thermometer.records.pick')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            flowing
              ? 'bg-primary'
              : link === 'connected'
                ? 'bg-amber-500'
                : 'bg-muted-foreground/40',
          )}
        />
        <span>{status}</span>
      </div>

      {!isMobile && (
        <Card className="py-0">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-1">
              <h2 className="font-semibold">{t('tools.thermometer.macApp.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('tools.thermometer.macApp.description')}
              </p>
              <p className="text-xs text-muted-foreground">{t('tools.thermometer.macApp.note')}</p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <a href={MAC_APP.href} download>
                <Download className="size-4" />
                {t('tools.thermometer.macApp.download', { size: MAC_APP.size })}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function chartData(s: Segment) {
  return { times: s.records.map((r) => r.time.getTime()), temps: s.records.map((r) => r.temps) }
}

function hms(s: number) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
}

/** "1 秒" / "5 分钟" / "1 小时 30 分" for intervals and durations. */
function span(t: TFunction, s: number): string {
  const n = Math.round(s)
  if (n < 60) return t('tools.thermometer.time.sec', { n })
  if (n < 3600)
    return n % 60
      ? t('tools.thermometer.time.minSec', { m: Math.floor(n / 60), s: n % 60 })
      : t('tools.thermometer.time.min', { n: n / 60 })
  const h = Math.floor(n / 3600)
  const m = Math.floor(n / 60) % 60
  return m
    ? t('tools.thermometer.time.hourMin', { h, m })
    : t('tools.thermometer.time.hour', { n: h })
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <TriangleAlert className="size-5 shrink-0" />
      {children}
    </div>
  )
}

function Badge({ tone, children }: { tone: 'amber' | 'red' | 'blue'; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    red: 'bg-red-500/15 text-red-700 dark:text-red-300',
    blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}

function ChannelToggles({
  visible,
  onChange,
}: {
  visible: boolean[]
  onChange: (v: boolean[]) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {CHANNELS.map((name, c) => (
        <label key={name} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={visible[c]}
            onChange={(e) => onChange(visible.map((v, k) => (k === c ? e.target.checked : v)))}
            className="size-4"
            style={{ accentColor: CHANNEL_COLORS[c] }}
          />
          <span style={{ color: CHANNEL_COLORS[c] }} className="font-medium">
            {name}
          </span>
        </label>
      ))}
    </div>
  )
}

function ExportMenu({
  onSelect,
  label,
  disabled,
  png,
  size = 'sm',
}: {
  onSelect: (kind: 'xlsx' | 'csv' | 'png') => void
  label: string
  disabled?: boolean
  png?: boolean
  size?: 'sm' | 'default'
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={disabled}>
          <Download className="size-4" />
          {label}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onSelect('xlsx')}>
          <Table2 className="size-4" />
          {t('tools.thermometer.exportXlsx')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('csv')}>
          <FileSpreadsheet className="size-4" />
          {t('tools.thermometer.exportCsv')}
        </DropdownMenuItem>
        {png && (
          <DropdownMenuItem onSelect={() => onSelect('png')}>
            <ImageIcon className="size-4" />
            {t('tools.thermometer.exportPng')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DeviceHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-5 text-sm">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold">{t('tools.thermometer.help.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('tools.thermometer.help.close')}
            className="-m-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t('tools.thermometer.help.usb')}</li>
          <li>{t('tools.thermometer.help.busy')}</li>
          {isMac && <li>{t('tools.thermometer.help.mac')}</li>}
        </ul>
        {isWindows && (
          <div className="space-y-2 rounded-lg bg-secondary/70 p-4">
            <p className="font-medium">{t('tools.thermometer.help.windowsTitle')}</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>{t('tools.thermometer.help.windowsStep1')}</li>
              <li>{t('tools.thermometer.help.windowsStep2')}</li>
              <li>{t('tools.thermometer.help.windowsStep3')}</li>
            </ol>
            <Button asChild size="sm">
              <a href={DRIVER_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                {t('tools.thermometer.help.driverButton')}
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
  size = 'sm',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-lg bg-secondary p-0.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-colors',
            size === 'md' ? 'px-3.5 py-1.5 text-sm' : 'px-3 py-1 text-xs',
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

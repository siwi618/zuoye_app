import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getDevice, type DeviceRead } from '@/api/literature'
import { WORKS, devicePath, findWork, workPath } from '@/lib/literature/corpus'
import { useAnalysisList } from '@/lib/literature/analysisList'
import type { TagKind } from '@/lib/literature/text'
import { AnalysisList } from '@/components/literature/AnalysisList'
import { IntroBlock } from '@/components/literature/IntroBlock'

const K = 'tools.literature'
const NONE = 'none' // Radix Select can't hold an empty value

// The works last chosen on a device page, remembered in this browser for the next one.
type Side = 'work' | 'compare'
const MEMORY: Record<Side, string> = {
  work: 'coral.literature.deviceWork',
  compare: 'coral.literature.deviceCompare',
}
const recall = (side: Side): string | null => {
  try {
    const key = localStorage.getItem(MEMORY[side])
    return findWork(key ?? undefined) ? key : null
  } catch {
    return null
  }
}
const remember = (side: Side, key: string | null) => {
  try {
    if (key) localStorage.setItem(MEMORY[side], key)
    else localStorage.removeItem(MEMORY[side])
  } catch {
    // storage unavailable: nothing is remembered
  }
}

// One half of the comparison: a work picker and that work's analyses using the device.
function Column({
  device,
  name,
  workKey,
  onChoose,
  onTag,
  prompt,
  loading = false,
}: {
  device: DeviceRead | undefined
  name: string
  workKey: string | null
  onChoose: (key: string | null) => void
  onTag: (name: string, kind: TagKind) => void
  prompt: string
  loading?: boolean // still finding out which work to show
}) {
  const { t } = useTranslation()
  const counts = new Map((device?.works ?? []).map((w) => [w.work_key, w.count]))
  const state = useAnalysisList(workKey, { sort: 'hot', tag: name })
  const work = findWork(workKey ?? undefined)
  // Works using the device first (most used first), then the rest.
  const works = [...WORKS].sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0))
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={workKey ?? NONE} onValueChange={(v) => onChoose(v === NONE ? null : v)}>
          <SelectTrigger aria-label={t(`${K}.chooseWork`)} className="w-64 max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t(`${K}.chooseWork`)}</SelectItem>
            {works.map((w) => (
              <SelectItem key={w.key} value={w.key}>
                《{w.title}》 · {t(`${K}.analysisCount`, { count: counts.get(w.key) ?? 0 })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {work && (
          <Link
            to={workPath(work.key)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <BookOpen className="size-3.5" />
            {t(`${K}.openWork`)}
          </Link>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t(`${K}.loadingWorks`)}</p>
      ) : work ? (
        <AnalysisList
          state={state}
          empty={t(`${K}.deviceNoneInWork`, { name: `#${name}`, title: work.title })}
          onTag={onTag}
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {prompt}
        </p>
      )}
    </section>
  )
}

// A #device's own page: its name and introduction (the same one as in the sphere's side panel),
// then two works side by side — on the right the one chosen, on the left another to compare —
// each listing its students' analyses that use the device.
export function LiteratureDevice() {
  const { name = '' } = useParams<{ name: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const device = useQuery({
    queryKey: ['literature-device', name.toLowerCase()],
    queryFn: () => getDevice(name),
  })
  // Opened without a work: each half starts on the work last chosen there; the right one, the
  // first time, on the work using the device most.
  const right = params.get('work') ?? recall('work') ?? device.data?.works[0]?.work_key ?? null
  const leftWanted = params.get('compare') ?? recall('compare')
  const left = leftWanted !== right ? leftWanted : null
  // Coming in with a work chosen (from the side panel's list) counts as choosing it.
  const fromLink = params.get('work')
  useEffect(() => {
    if (fromLink) remember('work', fromLink)
  }, [fromLink])
  const choose = (side: Side, key: string | null) => {
    remember(side, key)
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (side === 'work' && !next.get('work') && right) next.set('work', right)
        if (key) next.set(side, key)
        else next.delete(side)
        return next
      },
      { replace: true },
    )
  }
  // A device chip opens that device's page with the same works; a character goes to its work.
  const onTag = (tag: string, kind: TagKind, workKey: string | null) =>
    kind === 'device'
      ? navigate(devicePath(tag, right, left))
      : workKey && navigate(`${workPath(workKey)}?who=${encodeURIComponent(tag)}`)

  const title = device.data?.name ?? name
  return (
    <div className="space-y-8 pb-16">
      <div className="space-y-4">
        <Link
          to="/tools/literature"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('tools.items.literature')}
        </Link>
        <header className="space-y-1">
          <div className="text-xs font-medium text-primary">{t(`${K}.kindDevice`)}</div>
          <h1 className="text-3xl font-bold tracking-tight">#{title}</h1>
          {device.data && (
            <p className="text-muted-foreground">
              {t(`${K}.deviceUsage`, {
                count: device.data.total,
                works: device.data.works.length,
              })}
            </p>
          )}
        </header>
        <div className="max-w-3xl">
          <IntroBlock key={title.toLowerCase()} kind="device" subject={title} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-6">
        <div className="order-2 lg:order-1">
          <Column
            device={device.data}
            name={title}
            workKey={left}
            onChoose={(k) => choose('compare', k)}
            onTag={(n, k) => onTag(n, k, left)}
            prompt={t(`${K}.compareWithWork`, { name: `#${title}` })}
          />
        </div>
        <div className="order-1 lg:order-2">
          <Column
            device={device.data}
            name={title}
            workKey={right}
            onChoose={(k) => choose('work', k)}
            onTag={(n, k) => onTag(n, k, right)}
            // With nothing chosen or remembered, the right half waits for the most-used work.
            loading={!right && device.isLoading}
            prompt={t(`${K}.chooseWorkFor`, { name: `#${title}` })}
          />
        </div>
      </div>
    </div>
  )
}

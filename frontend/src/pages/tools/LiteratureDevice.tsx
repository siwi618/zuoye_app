import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, Search, X } from 'lucide-react'
import { getDevice, type DeviceRead } from '@/api/literature'
import { WORKS, devicePath, findWork, workPath } from '@/lib/literature/corpus'
import { useAnalysisList } from '@/lib/literature/analysisList'
import { useRubberBand } from '@/lib/rubberBand'
import type { TagKind } from '@/lib/literature/text'
import { AnalysisList } from '@/components/literature/AnalysisList'
import { IntroBlock } from '@/components/literature/IntroBlock'

const K = 'tools.literature'

// The works last shown on a device page, remembered in this browser for the next one.
// `work` is the left card, `compare` the right one; an empty value means the card was closed.
type Side = 'work' | 'compare'
const MEMORY: Record<Side, string> = {
  work: 'coral.literature.deviceWork',
  compare: 'coral.literature.deviceCompare',
}
// undefined: nothing remembered yet; null: remembered as closed.
const recall = (side: Side): string | null | undefined => {
  try {
    const key = localStorage.getItem(MEMORY[side])
    if (key === null) return undefined
    return findWork(key) ? key : null
  } catch {
    return undefined
  }
}
const remember = (side: Side, key: string | null) => {
  try {
    localStorage.setItem(MEMORY[side], key ?? '')
  } catch {
    // storage unavailable: nothing is remembered
  }
}

// Sliding: where each card was just before the cards changed, so it can glide over from there.
// Kept outside React (only one device page is open at a time), taken just before the change.
let before: Map<string, DOMRect> | null = null
const cardEls = () => [...document.querySelectorAll<HTMLElement>('[data-work-card]')]
const noteWhereCardsAre = () => {
  before = new Map(cardEls().map((el) => [el.dataset.workCard!, el.getBoundingClientRect()]))
}
// Glides each card that moved from where it was noted to where it is now.
const slideCards = () => {
  const was = before
  before = null
  if (!was || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  cardEls().forEach((el) => {
    const from = was.get(el.dataset.workCard!)
    if (!from) return
    const to = el.getBoundingClientRect()
    const dx = from.left - to.left
    const dy = from.top - to.top
    if (!dx && !dy) return
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
      duration: 350,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    })
  })
}

const valid = (key: string | null) => (findWork(key ?? undefined) ? key : null)

// Finds a work to put in a card: matches title, author or group, those using the device first.
function WorkSearch({
  counts,
  shown,
  onPick,
}: {
  counts: Map<string, number>
  shown: string[]
  onPick: (key: string) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const q = query.trim().toLowerCase()
  const found = WORKS.filter(
    (w) => !q || [w.title, w.author, w.group ?? ''].some((s) => s.toLowerCase().includes(q)),
  ).sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0))
  const full = shown.length >= 2
  const pick = (key: string) => {
    if (full || shown.includes(key)) return
    onPick(key)
    setQuery('')
    setOpen(false)
  }
  return (
    <div className="relative max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)} // still focused after a pick
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter') {
            const first = found.find((w) => !shown.includes(w.key))
            if (first) pick(first.key)
          }
        }}
        placeholder={t(`${K}.searchWorks`)}
        aria-label={t(`${K}.searchWorks`)}
        className="h-10 w-full rounded-full border border-border bg-background pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 space-y-1 rounded-2xl border border-border bg-popover p-2 shadow-lg">
          {full && (
            <p className="px-2 py-1 text-xs text-muted-foreground">{t(`${K}.bothCardsFull`)}</p>
          )}
          {found.length ? (
            found.map((w) => {
              const at = shown.indexOf(w.key)
              return (
                <button
                  key={w.key}
                  type="button"
                  disabled={full || at >= 0}
                  // Keep the focus (and the list) until the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(w.key)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="font-semibold">《{w.title}》</span>
                  <span className="text-muted-foreground">{w.author}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {at >= 0
                      ? t(at === 0 ? `${K}.onLeftCard` : `${K}.onRightCard`)
                      : t(`${K}.analysisCount`, { count: counts.get(w.key) ?? 0 })}
                  </span>
                </button>
              )
            })
          ) : (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              {t(`${K}.deviceSearchEmpty`, { query: query.trim() })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// One card of the comparison: a work's analyses using the device, scrolling on their own.
function WorkCard({
  name,
  workKey,
  count,
  onClose,
  onTag,
}: {
  name: string
  workKey: string
  count: number
  onClose: () => void
  onTag: (name: string, kind: TagKind) => void
}) {
  const { t } = useTranslation()
  const state = useAnalysisList(workKey, { sort: 'hot', tag: name })
  const scroller = useRef<HTMLDivElement>(null)
  useRubberBand(scroller)
  const work = findWork(workKey)!
  return (
    <section
      data-work-card={workKey}
      className="flex min-w-0 animate-in flex-col rounded-2xl border border-border bg-card duration-300 fade-in-0 slide-in-from-bottom-2"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">《{work.title}》</h2>
          <p className="text-xs text-muted-foreground">
            {work.author} · {t(`${K}.analysisCount`, { count })}
          </p>
        </div>
        <Link
          to={workPath(work.key)}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-primary"
        >
          <BookOpen className="size-3.5" />
          {t(`${K}.openWork`)}
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label={t(`${K}.closeCard`)}
          title={t(`${K}.closeCard`)}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>
      {/* Clips the list while it gives at either end. */}
      <div className="overflow-hidden rounded-b-2xl">
        <div
          ref={scroller}
          className="max-h-[70vh] overflow-y-auto overscroll-contain p-4 lg:max-h-[calc(100dvh-8rem)]"
        >
          <AnalysisList
            state={state}
            scroller={scroller}
            empty={t(`${K}.deviceNoneInWork`, { name: `#${name}`, title: work.title })}
            onTag={onTag}
          />
        </div>
      </div>
    </section>
  )
}

function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

// A #device's own page: its name and introduction (the same one as in the sphere's side panel),
// a search for works, then up to two works side by side, each card listing its students'
// analyses that use the device. Closing the left card slides the right one over.
export function LiteratureDevice() {
  const { name = '' } = useParams<{ name: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const device = useQuery({
    queryKey: ['literature-device', name.toLowerCase()],
    queryFn: () => getDevice(name),
  })
  // Each card shows the work in the link, else the one last shown there; the first time ever,
  // the left card starts on the work using the device most.
  const fromUrl = (side: Side) => (params.has(side) ? valid(params.get(side)) : recall(side))
  const leftWanted = fromUrl('work')
  const deciding = leftWanted === undefined && device.isLoading
  const left = leftWanted === undefined ? (device.data?.works[0]?.work_key ?? null) : leftWanted
  const rightWanted = fromUrl('compare') ?? null
  const cards = [left, rightWanted !== left ? rightWanted : null].filter((k): k is string => !!k)

  // Coming in with a work chosen (from the side panel's list) counts as choosing it.
  const fromLink = params.get('work')
  useEffect(() => {
    if (valid(fromLink)) remember('work', fromLink)
  }, [fromLink])

  const show = (next: string[]) => {
    noteWhereCardsAre()
    remember('work', next[0] ?? null)
    remember('compare', next[1] ?? null)
    setParams(
      (p) => {
        const q = new URLSearchParams(p)
        q.set('work', next[0] ?? '')
        if (next[1]) q.set('compare', next[1])
        else q.delete('compare')
        return q
      },
      { replace: true },
    )
  }
  const cardsKey = cards.join('|')
  useLayoutEffect(slideCards, [cardsKey])

  const counts = new Map((device.data?.works ?? []).map((w) => [w.work_key, w.count]))
  // A device chip opens that device's page with the same works; a character goes to its work.
  const onTag = (tag: string, kind: TagKind, workKey: string) =>
    kind === 'device'
      ? navigate(devicePath(tag, cards[0], cards[1]))
      : navigate(`${workPath(workKey)}?who=${encodeURIComponent(tag)}`)

  const title = device.data?.name ?? name
  const data: DeviceRead | undefined = device.data
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
          {data && (
            <p className="text-muted-foreground">
              {t(`${K}.deviceUsage`, { count: data.total, works: data.works.length })}
            </p>
          )}
        </header>
        <div className="max-w-3xl">
          <IntroBlock key={title.toLowerCase()} kind="device" subject={title} />
        </div>
        <WorkSearch counts={counts} shown={cards} onPick={(key) => show([...cards, key])} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {deciding ? (
          <EmptyCard>{t(`${K}.loadingWorks`)}</EmptyCard>
        ) : (
          cards.map((key) => (
            <WorkCard
              key={key}
              name={title}
              workKey={key}
              count={counts.get(key) ?? 0}
              onClose={() => show(cards.filter((k) => k !== key))}
              onTag={(n, k) => onTag(n, k, key)}
            />
          ))
        )}
        {!deciding && !cards.length && (
          <EmptyCard>{t(`${K}.searchWorkFor`, { name: `#${title}` })}</EmptyCard>
        )}
        {(deciding || cards.length < 2) && (
          <EmptyCard>{t(`${K}.compareWithWork`, { name: `#${title}` })}</EmptyCard>
        )}
      </div>
    </div>
  )
}

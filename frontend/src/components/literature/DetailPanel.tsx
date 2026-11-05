import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { searchTags, type OverviewRead, type TagRead } from '@/api/literature'
import { WORKS, devicePath, findWork, workPath } from '@/lib/literature/corpus'
import { deviceQuery, usePrefetch } from '@/lib/literature/queries'
import { cleanTag } from '@/lib/literature/text'
import type { Selection } from './DysonScene'
import { IntroBlock } from './IntroBlock'

const K = 'tools.literature'

type Kind = Selection['kind']

// The small label above a heading, leading back to a list page (or the overview).
function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
    >
      <ChevronLeft className="size-3.5" />
      {label}
    </button>
  )
}

// The heading of a group on the overview, opening that group's list page.
function GroupLink({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-1 text-xs font-medium text-primary"
    >
      {label}
      <span className="ml-auto text-muted-foreground group-hover:text-primary">
        {t(`${K}.seeAll`)}
      </span>
      <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-primary" />
    </button>
  )
}

const rowClass =
  'group flex w-full items-center gap-2 rounded-xl border border-border/70 p-3 text-left hover:border-primary/60'

function TagRow({ name, count, onClick }: { name: string; count: number; onClick: () => void }) {
  const { t } = useTranslation()
  const prefetch = usePrefetch()
  return (
    <button type="button" onClick={onClick} className={rowClass} {...prefetch.device(name)}>
      <span className="font-semibold group-hover:text-primary">#{name}</span>
      <span className="text-sm text-muted-foreground">{t(`${K}.analysisCount`, { count })}</span>
      <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function WorkRow({ workKey, onClick }: { workKey: string; onClick: () => void }) {
  const w = findWork(workKey)!
  const prefetch = usePrefetch()
  return (
    <button type="button" onClick={onClick} className={rowClass} {...prefetch.work(workKey)}>
      <span className="font-semibold group-hover:text-primary">《{w.title}》</span>
      <span className="text-sm text-muted-foreground">
        {w.author} · {w.year}
        {w.group && ` · 「${w.group}」`}
      </span>
      <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function NoTags() {
  const { t } = useTranslation()
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
      {t(`${K}.noTags`)}
    </p>
  )
}

// The devices list page: the hottest devices, or with a query, every device matching it.
function DeviceSearch({ hot, onPick }: { hot: TagRead[]; onPick: (tag: TagRead) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(cleanTag(query)), 250)
    return () => window.clearTimeout(id)
  }, [query])
  const found = useQuery({
    queryKey: ['literature-tags', 'device', undefined, term.toLowerCase()],
    queryFn: () => searchTags(term, 'device'),
    enabled: !!term,
    placeholderData: keepPreviousData,
  })
  const rows = term ? (found.data ?? []) : hot
  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(`${K}.searchDevices`)}
          aria-label={t(`${K}.searchDevices`)}
          className="h-9 w-full rounded-full border border-border bg-background pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
        />
      </div>
      {rows.length ? (
        rows.map((tag) => (
          <TagRow key={tag.id} name={tag.name} count={tag.count} onClick={() => onPick(tag)} />
        ))
      ) : term ? (
        <p className="text-sm text-muted-foreground">
          {t(`${K}.deviceSearchEmpty`, { query: term })}
        </p>
      ) : (
        <NoTags />
      )}
    </>
  )
}

// A device: its introduction, the way into its own page, and the works using it; a work opens
// the device page with that work in the left card.
function DeviceDetail({ tag, onHome }: { tag: TagRead; onHome: () => void }) {
  const { t } = useTranslation()
  const prefetch = usePrefetch()
  const device = useQuery(deviceQuery(tag.name))
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <BackLink label={t(`${K}.kindDevice`)} onClick={onHome} />
        <h2 className="text-2xl font-bold tracking-tight">#{tag.name}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {t(`${K}.tagUsedBy`, { count: device.data?.total ?? tag.count })}
        </p>
      </header>
      <section className="space-y-1.5 rounded-xl bg-secondary/50 p-3">
        <h3 className="text-xs font-medium text-primary">{t(`${K}.introLabel`)}</h3>
        <IntroBlock key={tag.name} kind="device" subject={tag.name} compact />
      </section>
      <Button asChild className="w-full">
        <Link to={devicePath(tag.name)} {...prefetch.device(tag.name)}>
          <BookOpen className="size-4" />
          {t(`${K}.openDevice`)}
        </Link>
      </Button>
      <div className="space-y-2">
        {device.isLoading && (
          <p className="text-sm text-muted-foreground">{t(`${K}.loadingWorks`)}</p>
        )}
        {device.isError && (
          <p className="text-sm text-destructive">
            {device.error instanceof Error ? device.error.message : t('common.error')}
          </p>
        )}
        {(device.data?.works ?? [])
          .filter((l) => findWork(l.work_key))
          .map((l) => {
            const w = findWork(l.work_key)!
            return (
              <Link
                key={l.work_key}
                to={devicePath(tag.name, w.key)}
                className={rowClass}
                {...prefetch.device(tag.name, w.key)}
              >
                <span className="font-semibold group-hover:text-primary">《{w.title}》</span>
                <span className="text-sm text-muted-foreground">
                  {t(`${K}.analysisCount`, { count: l.count })}
                </span>
                <span className="ml-auto text-xs text-muted-foreground group-hover:text-primary">
                  {t(`${K}.readAnalyses`)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
      </div>
    </div>
  )
}

export function DetailPanel({
  selected,
  home,
  overview,
  knownTags,
  onKnowTag,
  onSelect,
  onHome,
}: {
  selected: Selection | null
  home: Kind | null
  overview: OverviewRead | undefined
  // Devices found by searching (not on the sphere's core), so their details can open too.
  knownTags: TagRead[]
  onKnowTag: (tag: TagRead) => void
  onSelect: (s: Selection | null) => void
  onHome: (kind: Kind) => void
}) {
  const { t } = useTranslation()
  const prefetch = usePrefetch()
  const hot = overview?.tags ?? []
  const tags = [...hot, ...knownTags.filter((k) => !hot.some((h) => h.id === k.id))]
  const links = overview?.links ?? []
  const pickTag = (key: string) => onSelect({ kind: 'device', key })
  const pickWork = (key: string) => onSelect({ kind: 'work', key })

  // List pages: the tags on the core, or all works.
  if (!selected && home) {
    const devices = home === 'device'
    return (
      <div className="space-y-5">
        <header className="space-y-2">
          <BackLink label={t(`${K}.overviewLink`)} onClick={() => onSelect(null)} />
          <h2 className="text-2xl font-bold tracking-tight">
            {t(devices ? `${K}.kindDevice` : `${K}.kindWork`)}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {t(devices ? `${K}.deviceCount` : `${K}.workCount`, {
                count: devices ? hot.length : WORKS.length,
              })}
            </span>
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t(devices ? `${K}.deviceHomeHint` : `${K}.workHomeHint`)}
          </p>
        </header>
        <div className="space-y-2">
          {devices ? (
            <DeviceSearch
              hot={tags}
              onPick={(tag) => {
                onKnowTag(tag)
                pickTag(tag.id)
              }}
            />
          ) : (
            WORKS.map((w) => (
              <WorkRow key={w.key} workKey={w.key} onClick={() => pickWork(w.key)} />
            ))
          )}
        </div>
      </div>
    )
  }

  // Nothing selected: what the map holds, each entry a way in.
  if (!selected) {
    return (
      <div className="space-y-5">
        <header className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{t(`${K}.overview`)}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t(`${K}.overviewHint`)}</p>
        </header>
        <section className="space-y-2">
          <GroupLink label={t(`${K}.kindDevice`)} onClick={() => onHome('device')} />
          {hot.length ? (
            <div className="flex flex-wrap gap-2">
              {hot.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => pickTag(tag.id)}
                  className="rounded-full border border-border/70 px-3 py-1 text-sm hover:border-primary/60 hover:text-primary"
                  {...prefetch.device(tag.name)}
                >
                  #{tag.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{tag.count}</span>
                </button>
              ))}
            </div>
          ) : (
            <NoTags />
          )}
        </section>
        <section className="space-y-2">
          <GroupLink label={t(`${K}.kindWork`)} onClick={() => onHome('work')} />
          {WORKS.map((w) => (
            <WorkRow key={w.key} workKey={w.key} onClick={() => pickWork(w.key)} />
          ))}
        </section>
      </div>
    )
  }

  // A tag: the works whose analyses use it, most first; each opens that work's page filtered
  // to the tag.
  if (selected.kind === 'device') {
    const tag = tags.find((x) => x.id === selected.key)
    if (!tag) return null
    return <DeviceDetail tag={tag} onHome={() => onHome('device')} />
  }

  // A work: its hottest tags, and the way into its own page.
  const w = findWork(selected.key)
  if (!w) return null
  const used = links
    .filter((l) => l.work_key === w.key)
    .sort((a, b) => b.count - a.count)
    .flatMap((l) => {
      const tag = tags.find((x) => x.id === l.tag_id)
      return tag ? [{ ...tag, count: l.count }] : []
    })
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-1 text-xs font-medium text-primary">
          <BackLink label={t(`${K}.kindWork`)} onClick={() => onHome('work')} />
          {w.group && <span>· {t(`${K}.group`, { name: w.group })}</span>}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">《{w.title}》</h2>
        <p className="text-sm text-muted-foreground">
          {w.author} · {w.year}
        </p>
      </header>
      {/* The same introduction as on the work's page: editing either changes both. */}
      <section className="space-y-1.5 rounded-xl bg-secondary/50 p-3">
        <h3 className="text-xs font-medium text-primary">{t(`${K}.introLabel`)}</h3>
        <IntroBlock key={w.key} kind="work" subject={w.key} compact />
      </section>
      <Button asChild className="w-full">
        <Link to={workPath(w.key)} {...prefetch.work(w.key)}>
          <BookOpen className="size-4" />
          {t(`${K}.openWork`)}
        </Link>
      </Button>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-primary">{t(`${K}.workTags`)}</h3>
        {used.length ? (
          used.map((tag) => (
            <TagRow
              key={tag.id}
              name={tag.name}
              count={tag.count}
              onClick={() => pickTag(tag.id)}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t(`${K}.workNoTags`)}</p>
        )}
      </section>
    </div>
  )
}

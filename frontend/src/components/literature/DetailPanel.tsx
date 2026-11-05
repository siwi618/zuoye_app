import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OverviewRead } from '@/api/literature'
import { WORKS, findWork, workPath } from '@/lib/literature/corpus'
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
  return (
    <button type="button" onClick={onClick} className={rowClass}>
      <span className="font-semibold group-hover:text-primary">#{name}</span>
      <span className="text-sm text-muted-foreground">{t(`${K}.analysisCount`, { count })}</span>
      <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function WorkRow({ workKey, onClick }: { workKey: string; onClick: () => void }) {
  const w = findWork(workKey)!
  return (
    <button type="button" onClick={onClick} className={rowClass}>
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

export function DetailPanel({
  selected,
  home,
  overview,
  onSelect,
  onHome,
}: {
  selected: Selection | null
  home: Kind | null
  overview: OverviewRead | undefined
  onSelect: (s: Selection | null) => void
  onHome: (kind: Kind) => void
}) {
  const { t } = useTranslation()
  const tags = overview?.tags ?? []
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
                count: devices ? tags.length : WORKS.length,
              })}
            </span>
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t(devices ? `${K}.deviceHomeHint` : `${K}.workHomeHint`)}
          </p>
        </header>
        <div className="space-y-2">
          {devices ? (
            tags.length ? (
              tags.map((tag) => (
                <TagRow
                  key={tag.id}
                  name={tag.name}
                  count={tag.count}
                  onClick={() => pickTag(tag.id)}
                />
              ))
            ) : (
              <NoTags />
            )
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
          {tags.length ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => pickTag(tag.id)}
                  className="rounded-full border border-border/70 px-3 py-1 text-sm hover:border-primary/60 hover:text-primary"
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
    const works = links
      .filter((l) => l.tag_id === tag.id && findWork(l.work_key))
      .sort((a, b) => b.count - a.count)
    return (
      <div className="space-y-5">
        <header className="space-y-2">
          <BackLink label={t(`${K}.kindDevice`)} onClick={() => onHome('device')} />
          <h2 className="text-2xl font-bold tracking-tight">#{tag.name}</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t(`${K}.tagUsedBy`, { count: tag.count })}
          </p>
        </header>
        <section className="space-y-1.5 rounded-xl bg-secondary/50 p-3">
          <h3 className="text-xs font-medium text-primary">{t(`${K}.introLabel`)}</h3>
          <IntroBlock key={tag.name} kind="device" subject={tag.name} compact />
        </section>
        <div className="space-y-2">
          {works.map((l) => {
            const w = findWork(l.work_key)!
            return (
              <Link key={l.work_key} to={workPath(w.key, tag.name)} className={rowClass}>
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
        <Link to={workPath(w.key)}>
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

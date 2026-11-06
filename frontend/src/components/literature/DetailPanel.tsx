import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpen, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createWork,
  deleteWork,
  searchTags,
  type OverviewRead,
  type TagRead,
  type Work,
} from '@/api/literature'
import { LEAD_READER, useHasBadge } from '@/api/profile'
import {
  devicePath,
  emptyWorksQuery,
  useWorks,
  workByline,
  workPath,
  worksQuery,
} from '@/lib/literature/corpus'
import { deviceQuery, usePrefetch, workQuery } from '@/lib/literature/queries'
import { cleanTag } from '@/lib/literature/text'
import { cn } from '@/lib/utils'
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

// `deletable`: a 「鱼果」 holder's list page, where empty works get a bin at the end of the row.
function WorkRow({
  work: w,
  onClick,
  deletable = false,
}: {
  work: Work
  onClick: () => void
  deletable?: boolean
}) {
  const prefetch = usePrefetch()
  const row = (
    <button
      type="button"
      onClick={onClick}
      className={rowClass}
      {...prefetch.work(w.key)}
    >
      <span className="shrink-0 font-semibold whitespace-nowrap group-hover:text-primary">
        《{w.title}》
      </span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        {workByline(w)}
        {w.group && ` · 「${w.group}」`}
      </span>
      {/* room for the bin, left of the chevron */}
      {deletable && <span className="ml-auto w-7 shrink-0" />}
      <ChevronRight
        className={cn('size-4 shrink-0 text-muted-foreground', !deletable && 'ml-auto')}
      />
    </button>
  )
  if (!deletable) return row
  return (
    <div className="relative">
      {row}
      <DeleteWorkBin work={w} />
    </div>
  )
}

// Holders of the 「鱼果」 badge add a work here; it then appears on the sphere's shell.
function AddWork({ works, onAdded }: { works: Work[]; onAdded: (key: string) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [year, setYear] = useState('')
  const [group, setGroup] = useState('')
  const groups = [...new Set(works.flatMap((w) => (w.group ? [w.group] : [])))]
  const reset = () => {
    setOpen(false)
    setTitle('')
    setAuthor('')
    setYear('')
    setGroup('')
  }
  const add = useMutation({
    mutationFn: () =>
      createWork({
        title: title.replace(/[《》]/g, '').trim(),
        author: author.trim(),
        year: year.trim() ? Number(year) : null,
        group: group.replace(/[「」]/g, '').trim() || null,
      }),
    onSuccess: (work) => {
      queryClient.setQueryData(worksQuery.queryKey, (ws) => [...(ws ?? []), work])
      void queryClient.invalidateQueries({ queryKey: worksQuery.queryKey })
      void queryClient.invalidateQueries({ queryKey: emptyWorksQuery.queryKey })
      toast.success(t(`${K}.workAdded`, { title: work.title }))
      reset()
      onAdded(work.key)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })
  const yearOk = !year.trim() || /^-?\d{1,4}$/.test(year.trim())
  const ready = !!title.replace(/[《》]/g, '').trim() && !!author.trim() && yearOk
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ready && !add.isPending) add.mutate()
  }

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/50 p-3 text-sm font-medium text-primary hover:border-primary hover:bg-primary/5"
      >
        <Plus className="size-4" />
        {t(`${K}.addWork`)}
      </button>
    )
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-primary/40 p-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 space-y-1.5">
          <span className="block text-sm font-medium">{t(`${K}.workTitle`)}</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={40}
            placeholder={t(`${K}.workTitlePlaceholder`)}
            autoFocus
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">{t(`${K}.workAuthor`)}</span>
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={40} />
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">{t(`${K}.workYear`)}</span>
          <Input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            maxLength={5}
            aria-invalid={!yearOk}
          />
        </label>
        <label className="col-span-2 space-y-1.5">
          <span className="block text-sm font-medium">{t(`${K}.workGroup`)}</span>
          <Input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            maxLength={20}
            list="lit-work-groups"
            placeholder={t(`${K}.workGroupPlaceholder`)}
          />
          <datalist id="lit-work-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!ready || add.isPending}>
          {add.isPending ? '…' : t(`${K}.addWorkSubmit`)}
        </Button>
      </div>
    </form>
  )
}

// Holders of the 「鱼果」 badge can delete a work while nothing is written under it (no quotes or
// analyses or @character tags). Which works are empty comes from the server in one list.
function useDeleteWork(work: Work, onDeleted?: () => void) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const keys = useQuery(emptyWorksQuery).data
  // An older backend answers this path with a work, not a list: then nothing is deletable.
  const empty = Array.isArray(keys) && keys.includes(work.key)
  const remove = useMutation({
    mutationFn: () => deleteWork(work.key),
    onSuccess: () => {
      queryClient.setQueryData(worksQuery.queryKey, (ws) => ws?.filter((w) => w.key !== work.key))
      queryClient.setQueryData(emptyWorksQuery.queryKey, (ks) => ks?.filter((k) => k !== work.key))
      void queryClient.invalidateQueries({ queryKey: worksQuery.queryKey })
      void queryClient.invalidateQueries({ queryKey: emptyWorksQuery.queryKey })
      queryClient.removeQueries({ queryKey: workQuery(work.key).queryKey })
      toast.success(t(`${K}.workDeleted`, { title: work.title }))
      onDeleted?.()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })
  const ask = () => {
    if (!remove.isPending && window.confirm(t(`${K}.deleteWorkConfirm`, { title: work.title })))
      remove.mutate()
  }
  return { empty, ask, pending: remove.isPending }
}

// At the bottom of a work's details.
function DeleteWork({ work, onDeleted }: { work: Work; onDeleted: () => void }) {
  const { t } = useTranslation()
  const { empty, ask, pending } = useDeleteWork(work, onDeleted)
  if (!empty) return null
  return (
    <button
      type="button"
      disabled={pending}
      onClick={ask}
      className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
      {t(`${K}.deleteWork`)}
    </button>
  )
}

// At the end of a row on the works list page, left of the chevron.
function DeleteWorkBin({ work }: { work: Work }) {
  const { t } = useTranslation()
  const { empty, ask, pending } = useDeleteWork(work)
  if (!empty) return null
  return (
    <button
      type="button"
      disabled={pending}
      onClick={ask}
      aria-label={`${t(`${K}.deleteWork`)}《${work.title}》`}
      title={t(`${K}.deleteWork`)}
      className="absolute top-1/2 right-9 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
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
  const { find } = useWorks()
  // Opening the device's page is the likely next step: start loading it now.
  useEffect(() => prefetch.load.device(tag.name), [prefetch, tag.name])
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
          .filter((l) => find(l.work_key))
          .map((l) => {
            const w = find(l.work_key)!
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
  const { works, find } = useWorks()
  const leadReader = useHasBadge(LEAD_READER)
  // A work's details lead to its page: start loading it as soon as they show.
  const shownWork = selected?.kind === 'work' ? find(selected.key)?.key : undefined
  useEffect(() => {
    if (shownWork) prefetch.load.work(shownWork)
  }, [prefetch, shownWork])

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
                count: devices ? hot.length : works.length,
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
            <>
              {leadReader && <AddWork works={works} onAdded={pickWork} />}
              {works.map((w) => (
                <WorkRow
                  key={w.key}
                  work={w}
                  onClick={() => pickWork(w.key)}
                  deletable={leadReader}
                />
              ))}
            </>
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
          {works.map((w) => (
            <WorkRow key={w.key} work={w} onClick={() => pickWork(w.key)} />
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
  const w = find(selected.key)
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
        <p className="text-sm text-muted-foreground">{workByline(w)}</p>
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
      {leadReader && <DeleteWork work={w} onDeleted={() => onHome('work')} />}
    </div>
  )
}

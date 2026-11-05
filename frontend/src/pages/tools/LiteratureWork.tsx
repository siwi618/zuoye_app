import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Check, PenLine, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import {
  createQuote,
  deleteAnalysis,
  deleteQuote,
  getWork,
  toggleAnalysisLike,
  type AnalysisRead,
  type QuoteRead,
  type WorkRead,
} from '@/api/literature'
import { findWork } from '@/lib/literature/corpus'
import { sliceChars } from '@/lib/literature/text'
import { PageLabel, QuoteText } from '@/components/literature/QuoteText'
import { AnalysisCard } from '@/components/literature/AnalysisCard'
import { AnalysisComposer } from '@/components/literature/AnalysisComposer'
import { AnalysisFilter } from '@/components/literature/AnalysisFilter'

const K = 'tools.literature'
// Quotes shown before「显示全部」.
const SHOWN_QUOTES = 5
const MAX_PICKED = 10
type Sort = 'hot' | 'new' | 'mine'
const SORTS: Sort[] = ['hot', 'new', 'mine']

// Deleting hides the item at once instead of when the work has reloaded (a few seconds later),
// so it can't be pressed a second time meanwhile; a 404 means it is already gone, which is done.
function useRemove(
  workKey: string,
  remove: (id: string) => Promise<void>,
  drop: (work: WorkRead, id: string) => WorkRead,
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const queryKey = ['literature-work', workKey]
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await remove(id)
      } catch (e) {
        if (!(e instanceof Error && e.message.startsWith('API 404'))) throw e
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<WorkRead>(queryKey)
      if (prev) queryClient.setQueryData(queryKey, drop(prev, id))
      return { prev }
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
      toast.error(e instanceof Error ? e.message : t('common.error'))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: ['literature-overview'] })
    },
  })
}

function QuoteForm({
  workKey,
  editions,
  onClose,
}: {
  workKey: string
  editions: string[] // editions other quotes of this work give, offered as suggestions
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editionList = useId()
  const [body, setBody] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [edition, setEdition] = useState('')
  const from = Number(start)
  const to = end ? Number(end) : from
  const valid =
    body.trim() !== '' && Number.isInteger(from) && from >= 1 && Number.isInteger(to) && to >= from

  const add = useMutation({
    mutationFn: () =>
      createQuote(workKey, {
        body: body.trim(),
        page_start: from,
        page_end: to,
        edition: edition.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['literature-work', workKey] })
      toast.success(t(`${K}.quoteAdded`))
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) add.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium">{t(`${K}.quoteBody`)}</span>
        <Textarea
          autoFocus
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t(`${K}.quotePlaceholder`)}
          className="min-h-28"
        />
      </label>
      <div className="flex flex-wrap items-start gap-3">
        <label className="space-y-1.5">
          <span className="block text-sm leading-5 font-medium">{t(`${K}.pageStart`)}</span>
          <Input
            type="number"
            min={1}
            max={9999}
            inputMode="numeric"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-28"
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm leading-5 font-medium">{t(`${K}.pageEnd`)}</span>
          <Input
            type="number"
            min={from || 1}
            max={9999}
            inputMode="numeric"
            value={end}
            placeholder={start}
            onChange={(e) => setEnd(e.target.value)}
            className="w-28"
          />
        </label>
        <label className="min-w-48 flex-1 space-y-1.5">
          <span className="block text-sm leading-5 font-medium">
            {t(`${K}.edition`)}
            <span className="ml-1 font-normal text-muted-foreground">{t(`${K}.optional`)}</span>
          </span>
          <Input
            value={edition}
            maxLength={60}
            list={editionList}
            placeholder={t(`${K}.editionPlaceholder`)}
            onChange={(e) => setEdition(e.target.value)}
          />
        </label>
        <datalist id={editionList}>
          {editions.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        <p className="basis-full text-xs text-muted-foreground">{t(`${K}.pageHint`)}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t(`${K}.cancel`)}
        </Button>
        <Button type="submit" disabled={!valid || add.isPending}>
          {t(`${K}.submitQuote`)}
        </Button>
      </div>
    </form>
  )
}

function QuoteRow({
  quote: q,
  picked,
  canPick,
  mine,
  onToggle,
  onDelete,
  onShowAnalyses,
}: {
  quote: QuoteRead
  picked: boolean
  canPick: boolean
  mine: boolean
  onToggle: () => void
  onDelete: () => void
  onShowAnalyses: () => void
}) {
  const { t } = useTranslation()
  return (
    <li
      className={cn(
        'flex gap-3 rounded-2xl border bg-card p-4 transition-colors',
        picked ? 'border-primary bg-primary/5' : 'border-border/60',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={picked}
        aria-label={t(`${K}.pickQuote`)}
        disabled={!picked && !canPick}
        onClick={onToggle}
        className={cn(
          'mt-1 grid size-5 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-40',
          picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {picked && <Check className="size-3.5" />}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <PageLabel start={q.page_start} end={q.page_end} edition={q.edition} />
        <QuoteText body={q.body} />
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span>{t(`${K}.addedBy`, { name: q.author.display_name })}</span>
          {q.cited_count > 0 && (
            <button type="button" onClick={onShowAnalyses} className="hover:text-primary">
              {t(`${K}.citedBy`, { count: q.cited_count })}
            </button>
          )}
          {mine && q.cited_count === 0 && (
            <button
              type="button"
              onClick={() => window.confirm(t(`${K}.deleteQuoteConfirm`)) && onDelete()}
              className="ml-auto inline-flex items-center gap-1 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              {t(`${K}.delete`)}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

// One work: students' quotes (by page), the #devices their analyses use (most used first), and
// the analyses themselves. Picking quotes and pressing「分享我自己的分析」opens the composer.
export function LiteratureWork() {
  const { key } = useParams<{ key: string }>()
  const work = findWork(key)
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  const patchAnalysis = (id: string, fn: (a: AnalysisRead) => AnalysisRead) =>
    queryClient.setQueryData<WorkRead>(
      ['literature-work', key],
      (w) => w && { ...w, analyses: w.analyses.map((a) => (a.id === id ? fn(a) : a)) },
    )
  // Sort and filters live in the URL, so they survive a reload and can be shared.
  const [params, setParams] = useSearchParams()
  const tagFilter = params.get('tag')
  const quoteFilter = params.get('quote')
  const sort: Sort = SORTS.find((x) => x === params.get('sort')) ?? 'hot'
  const setParam = (name: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value) next.set(name, value)
        else next.delete(name)
        return next
      },
      { replace: true },
    )
  const analysesAt = useRef<HTMLElement>(null)
  const [adding, setAdding] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [composing, setComposing] = useState(false)
  const composerAt = useRef<HTMLDivElement>(null)

  const data = useQuery({
    queryKey: ['literature-work', key],
    queryFn: () => getWork(key!),
    enabled: !!work,
  })
  const quotes = useMemo(() => data.data?.quotes ?? [], [data.data])
  const byId = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes])
  // Editions already given for this work, most used first.
  const editions = useMemo(() => {
    const n = new Map<string, number>()
    for (const q of quotes) if (q.edition) n.set(q.edition, (n.get(q.edition) ?? 0) + 1)
    return [...n.keys()].sort((a, b) => n.get(b)! - n.get(a)!)
  }, [quotes])

  const removeAnalysis = useRemove(key ?? '', deleteAnalysis, (w, id) => ({
    ...w,
    analyses: w.analyses.filter((a) => a.id !== id),
  }))
  // Liking shows at once; the server's count replaces the guess when it answers.
  const like = useMutation({
    mutationFn: toggleAnalysisLike,
    onMutate: async (id: string) => {
      const queryKey = ['literature-work', key]
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<WorkRead>(queryKey)
      patchAnalysis(id, (a) => ({
        ...a,
        rank: a.rank ?? a.like_count,
        liked_by_me: !a.liked_by_me,
        like_count: a.like_count + (a.liked_by_me ? -1 : 1),
      }))
      return { prev }
    },
    onSuccess: (res, id) =>
      patchAnalysis(id, (a) => ({ ...a, liked_by_me: res.liked, like_count: res.like_count })),
    onError: (e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['literature-work', key], ctx.prev)
      toast.error(e instanceof Error ? e.message : t('common.error'))
    },
  })
  const removeQuote = useRemove(key ?? '', deleteQuote, (w, id) => ({
    ...w,
    quotes: w.quotes.filter((q) => q.id !== id),
  }))

  if (!work) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{t(`${K}.workNotFound`)}</p>
        <Link to="/tools/literature" className="text-sm text-primary hover:underline">
          {t('tools.items.literature')}
        </Link>
      </div>
    )
  }

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const pickedQuotes = quotes.filter((q) => picked.includes(q.id))
  const shown = showAll ? quotes : quotes.slice(0, SHOWN_QUOTES)
  const filterBy = (name: string | null) => setParam('tag', name)
  const showAnalysesOf = (quoteId: string) => {
    setParam('quote', quoteId)
    requestAnimationFrame(() =>
      analysesAt.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }
  const all = data.data?.analyses ?? []
  const likes = (a: AnalysisRead) => a.rank ?? a.like_count
  const newest = (a: AnalysisRead, b: AnalysisRead) => b.created_at.localeCompare(a.created_at)
  const hottest = (a: AnalysisRead, b: AnalysisRead) => likes(b) - likes(a) || newest(a, b)
  const own = (a: AnalysisRead) => (a.author.id === userId ? 0 : 1)
  // 「我的」: the reader's own analyses on top (newest first), then everyone else's by likes.
  const order = {
    hot: hottest,
    new: newest,
    mine: (a: AnalysisRead, b: AnalysisRead) =>
      own(a) - own(b) || (own(a) === 0 ? newest(a, b) : hottest(a, b)),
  }[sort]
  const analyses = all
    .filter(
      (a) =>
        (!tagFilter || a.tags.some((x) => x.name.toLowerCase() === tagFilter.toLowerCase())) &&
        (!quoteFilter || a.quote_ids.includes(quoteFilter)),
    )
    .sort(order)
  const filtering = !!tagFilter || !!quoteFilter
  const pageText = (q: QuoteRead) =>
    q.page_start === q.page_end
      ? t(`${K}.pageOne`, { start: q.page_start })
      : t(`${K}.pageRange`, { start: q.page_start, end: q.page_end })
  const citedQuotes = quotes.filter((q) => q.cited_count > 0)
  const activeQuote = quoteFilter ? byId.get(quoteFilter) : undefined
  const compose = () => {
    setComposing(true)
    requestAnimationFrame(() =>
      composerAt.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-24">
      <div className="space-y-4">
        <Link
          to="/tools/literature"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('tools.items.literature')}
        </Link>
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">《{work.title}》</h1>
          <p className="text-muted-foreground">
            {work.author} · {work.year}
            {work.group && ` · ${t(`${K}.group`, { name: work.group })}`}
          </p>
        </header>
      </div>

      {data.isError && (
        <p className="text-destructive">
          {data.error instanceof Error ? data.error.message : t('common.error')}
        </p>
      )}

      {/* Quotes */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              {t(`${K}.quotes`)}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                {quotes.length}
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">{t(`${K}.quotesHint`)}</p>
          </div>
          {!adding && (
            <Button variant="outline" className="ml-auto" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              {t(`${K}.addQuote`)}
            </Button>
          )}
        </div>
        {adding && (
          <QuoteForm workKey={work.key} editions={editions} onClose={() => setAdding(false)} />
        )}
        {data.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : quotes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t(`${K}.noQuotes`)}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {shown.map((q) => (
                <QuoteRow
                  key={q.id}
                  quote={q}
                  picked={picked.includes(q.id)}
                  canPick={picked.length < MAX_PICKED}
                  mine={q.author.id === userId}
                  onToggle={() => toggle(q.id)}
                  onDelete={() => {
                    setPicked((p) => p.filter((x) => x !== q.id))
                    removeQuote.mutate(q.id)
                  }}
                  onShowAnalyses={() => showAnalysesOf(q.id)}
                />
              ))}
            </ul>
            {quotes.length > SHOWN_QUOTES && (
              <Button variant="ghost" className="w-full" onClick={() => setShowAll(!showAll)}>
                {showAll ? t(`${K}.collapse`) : t(`${K}.showAll`, { count: quotes.length })}
              </Button>
            )}
            {picked.length >= MAX_PICKED && (
              <p className="text-xs text-muted-foreground">
                {t(`${K}.maxQuotes`, { count: MAX_PICKED })}
              </p>
            )}
          </>
        )}
      </section>

      {/* Related devices */}
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t(`${K}.relatedTags`)}</h2>
          <p className="text-sm text-muted-foreground">{t(`${K}.relatedHint`)}</p>
        </div>
        {data.data?.tags.length ? (
          <div className="flex flex-wrap gap-2">
            {data.data.tags.map((tag) => {
              const on = tagFilter?.toLowerCase() === tag.name.toLowerCase()
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => filterBy(on ? null : tag.name)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-colors',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 hover:border-primary/60 hover:text-primary',
                  )}
                >
                  #{tag.name}
                  <span
                    className={cn('ml-1.5 text-xs', on ? 'opacity-80' : 'text-muted-foreground')}
                  >
                    {tag.count}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t(`${K}.noRelated`)}</p>
        )}
      </section>

      {/* Analyses */}
      <section ref={analysesAt} className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              {t(`${K}.analyses`)}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                {data.data?.analyses.length ?? 0}
              </span>
            </h2>
            {!composing && (
              <p className="text-sm text-muted-foreground">
                {picked.length
                  ? t(`${K}.selectedCount`, { count: picked.length })
                  : t(`${K}.pickFirst`)}
              </p>
            )}
          </div>
          {!composing && (
            <Button className="ml-auto" disabled={!picked.length} onClick={compose}>
              <PenLine className="size-4" />
              {t(`${K}.share`)}
            </Button>
          )}
        </div>

        <div ref={composerAt} className="scroll-mt-24">
          {composing && pickedQuotes.length > 0 && (
            <AnalysisComposer
              workKey={work.key}
              quotes={pickedQuotes}
              onUnpick={toggle}
              onCancel={() => setComposing(false)}
              onDone={() => {
                setComposing(false)
                setPicked([])
              }}
            />
          )}
        </div>

        {all.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sort} onValueChange={(v) => setParam('sort', v === 'hot' ? null : v)}>
              <SelectTrigger aria-label={t(`${K}.sortLabel`)} className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(`${K}.sort_${x}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AnalysisFilter
              quotes={citedQuotes}
              tags={data.data?.tags ?? []}
              onQuote={(id) => setParam('quote', id)}
              onTag={(name) => filterBy(name)}
            />
          </div>
        )}
        {all.length > 0 && filtering && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {activeQuote && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-100 py-1 pr-1 pl-3 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100">
                <span className="truncate">
                  {pageText(activeQuote)} · {sliceChars(activeQuote.body, 0, 12)}
                  {[...activeQuote.body].length > 12 && '…'}
                </span>
                <button
                  type="button"
                  aria-label={t(`${K}.removeFilter`)}
                  onClick={() => setParam('quote', null)}
                  className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-amber-200/70 dark:hover:bg-amber-400/30"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            {tagFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pr-1 pl-3 font-medium text-primary">
                #{tagFilter}
                <button
                  type="button"
                  aria-label={t(`${K}.removeFilter`)}
                  onClick={() => filterBy(null)}
                  className="grid size-5 place-items-center rounded-full hover:bg-primary/15"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            <span className="flex items-center gap-2 text-muted-foreground">
              {t(`${K}.matchCount`, { count: analyses.length })}
              <button
                type="button"
                onClick={() =>
                  setParams(
                    (p) => {
                      const next = new URLSearchParams(p)
                      next.delete('tag')
                      next.delete('quote')
                      return next
                    },
                    { replace: true },
                  )
                }
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                <X className="size-3.5" />
                {t(`${K}.clearFilters`)}
              </button>
            </span>
          </div>
        )}
        {data.data &&
          (analyses.length ? (
            <div className="space-y-4">
              {analyses.map((a) => (
                <AnalysisCard
                  key={a.id}
                  analysis={a}
                  quotes={byId}
                  mine={a.author.id === userId}
                  deleting={removeAnalysis.isPending && removeAnalysis.variables === a.id}
                  onTag={(name) => filterBy(name)}
                  onLike={() => like.mutate(a.id)}
                  onDelete={() => removeAnalysis.mutate(a.id)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {filtering ? t(`${K}.noMatch`) : t(`${K}.noAnalyses`)}
            </p>
          ))}
      </section>

      {/* Picked quotes, always in reach while scrolling */}
      {picked.length > 0 && !composing && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card py-1.5 pr-1.5 pl-4 text-sm shadow-soft-lg">
            <span>{t(`${K}.selectedCount`, { count: picked.length })}</span>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="text-muted-foreground hover:text-foreground"
            >
              {t(`${K}.clear`)}
            </button>
            <Button size="sm" className="rounded-full" onClick={compose}>
              <PenLine className="size-4" />
              {t(`${K}.share`)}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

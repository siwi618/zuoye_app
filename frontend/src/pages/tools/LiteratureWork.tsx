import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Check, PenLine, Pencil, Plus, Trash2, X } from 'lucide-react'
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
  listAnalyses,
  type AnalysisPage,
  type QuoteVersion,
  toggleAnalysisLike,
  updateQuote,
  type AnalysisRead,
  type QuoteRead,
  type WorkRead,
} from '@/api/literature'
import { findWork } from '@/lib/literature/corpus'
import { TAG_SYMBOL, TAG_TONE, sliceChars, type TagKind } from '@/lib/literature/text'
import { PageLabel, QuoteText } from '@/components/literature/QuoteText'
import { AnalysisCard } from '@/components/literature/AnalysisCard'
import { AnalysisComposer } from '@/components/literature/AnalysisComposer'
import { AnalysisFilter } from '@/components/literature/AnalysisFilter'
import { IntroBlock } from '@/components/literature/IntroBlock'

const K = 'tools.literature'
// Quotes shown before「显示全部」.
const SHOWN_QUOTES = 5
const MAX_PICKED = 10
// Analyses loaded per page while scrolling.
const PAGE_SIZE = 20
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

// Adding a quote, or with `initial` editing one (anyone may: the edit becomes its next version,
// and analyses already written keep the version they cite).
function QuoteForm({
  workKey,
  editions,
  initial,
  onClose,
}: {
  workKey: string
  editions: string[] // editions other quotes of this work give, offered as suggestions
  initial?: QuoteRead
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editionList = useId()
  const [body, setBody] = useState(initial?.body ?? '')
  const [start, setStart] = useState(initial ? String(initial.page_start) : '')
  const [end, setEnd] = useState(
    initial && initial.page_end !== initial.page_start ? String(initial.page_end) : '',
  )
  const [edition, setEdition] = useState(initial?.edition ?? '')
  const from = Number(start)
  const to = end ? Number(end) : from
  const valid =
    body.trim() !== '' && Number.isInteger(from) && from >= 1 && Number.isInteger(to) && to >= from

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        body: body.trim(),
        page_start: from,
        page_end: to,
        edition: edition.trim() || null,
      }
      if (initial) await updateQuote(initial.id, payload)
      else await createQuote(workKey, payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['literature-work', workKey] })
      toast.success(t(initial ? `${K}.quoteUpdated` : `${K}.quoteAdded`))
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) save.mutate()
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
        <Button type="submit" disabled={!valid || save.isPending}>
          {t(initial ? `${K}.saveQuote` : `${K}.submitQuote`)}
        </Button>
      </div>
    </form>
  )
}

function QuoteRow({
  quote: q,
  editions,
  picked,
  canPick,
  mine,
  onToggle,
  onDelete,
  onShowAnalyses,
}: {
  quote: QuoteRead
  editions: string[]
  picked: boolean
  canPick: boolean
  mine: boolean
  onToggle: () => void
  onDelete: () => void
  onShowAnalyses: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <li>
        <QuoteForm
          workKey={q.work_key}
          editions={editions}
          initial={q}
          onClose={() => setEditing(false)}
        />
      </li>
    )
  }
  // A click anywhere on the card picks it, except on its own buttons or while selecting text.
  const pickFromCard = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('button, a')) return
    if (document.getSelection()?.toString()) return
    if (picked || canPick) onToggle()
  }
  return (
    <li
      onClick={pickFromCard}
      className={cn(
        'flex cursor-pointer gap-3 rounded-2xl border bg-card p-4 transition-colors',
        picked ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40',
        !picked && !canPick && 'cursor-default',
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
          <span>
            {t(`${K}.addedBy`, { name: q.author.display_name })}
            {q.last_editor && ` · ${t(`${K}.lastEditedBy`, { name: q.last_editor.display_name })}`}
          </span>
          {q.cited_count > 0 && (
            <button type="button" onClick={onShowAnalyses} className="hover:text-primary">
              {t(`${K}.citedBy`, { count: q.cited_count })}
            </button>
          )}
          <span className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 hover:text-primary"
            >
              <Pencil className="size-3.5" />
              {t(`${K}.editQuote`)}
            </button>
            {mine && q.cited_count === 0 && (
              <button
                type="button"
                onClick={() => window.confirm(t(`${K}.deleteQuoteConfirm`)) && onDelete()}
                className="inline-flex items-center gap-1 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                {t(`${K}.delete`)}
              </button>
            )}
          </span>
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
  // Sort and filters live in the URL, so they survive a reload and can be shared.
  const [params, setParams] = useSearchParams()
  const tagFilter = params.get('tag') // a #device
  const whoFilter = params.get('who') // an @character
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

  // The analyses come PAGE_SIZE at a time, sorted and filtered by the server; scrolling to the
  // end of the list loads the next page.
  const list = useInfiniteQuery({
    queryKey: ['literature-analyses', key, sort, tagFilter, whoFilter, quoteFilter],
    queryFn: ({ pageParam }) =>
      listAnalyses(key!, {
        sort,
        tag: tagFilter,
        who: whoFilter,
        quote: quoteFilter,
        offset: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
    // Changing the sort or a filter keeps the old list on screen until the new one arrives.
    placeholderData: keepPreviousData,
    enabled: !!work,
  })
  const { analyses, versions } = useMemo(() => {
    // A page boundary can shift while scrolling (a new analysis, a changed like count): skip
    // anything already shown.
    const seen = new Set<string>()
    const items: AnalysisRead[] = []
    const vs = new Map<string, QuoteVersion>()
    for (const page of list.data?.pages ?? []) {
      for (const a of page.items) {
        if (seen.has(a.id)) continue
        seen.add(a.id)
        items.push(a)
      }
      for (const v of page.versions) vs.set(v.id, v)
    }
    return { analyses: items, versions: vs }
  }, [list.data])
  const matching = list.data?.pages[0]?.total ?? 0
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  const listEnd = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listEnd.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Optimistic changes apply to every loaded list of this work's analyses (any sort or filter).
  const analysesKey = ['literature-analyses', key]
  const patchAnalyses = (fn: (a: AnalysisRead) => AnalysisRead | null) =>
    queryClient.setQueriesData<InfiniteData<AnalysisPage>>(
      { queryKey: analysesKey },
      (d) =>
        d && {
          ...d,
          pages: d.pages.map((p) => ({
            ...p,
            items: p.items.flatMap((a) => {
              const next = fn(a)
              return next ? [next] : []
            }),
          })),
        },
    )
  const optimistic = async (fn: (a: AnalysisRead) => AnalysisRead | null) => {
    await queryClient.cancelQueries({ queryKey: analysesKey })
    const prev = queryClient.getQueriesData<InfiniteData<AnalysisPage>>({ queryKey: analysesKey })
    patchAnalyses(fn)
    return { prev }
  }
  const rollback = (ctx?: { prev: [QueryKey, unknown][] }) =>
    ctx?.prev.forEach(([k, d]) => queryClient.setQueryData(k, d))
  // Editions already given for this work, most used first.
  const editions = useMemo(() => {
    const n = new Map<string, number>()
    for (const q of quotes) if (q.edition) n.set(q.edition, (n.get(q.edition) ?? 0) + 1)
    return [...n.keys()].sort((a, b) => n.get(b)! - n.get(a)!)
  }, [quotes])

  // Deleting hides the analysis at once (a 404 means it is already gone, which is done).
  const removeAnalysis = useMutation({
    mutationFn: async (id: string) => {
      try {
        await deleteAnalysis(id)
      } catch (e) {
        if (!(e instanceof Error && e.message.startsWith('API 404'))) throw e
      }
    },
    onMutate: (id: string) => optimistic((a) => (a.id === id ? null : a)),
    onError: (e, _id, ctx) => {
      rollback(ctx)
      toast.error(e instanceof Error ? e.message : t('common.error'))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: analysesKey })
      void queryClient.invalidateQueries({ queryKey: ['literature-work', key] })
      void queryClient.invalidateQueries({ queryKey: ['literature-overview'] })
    },
  })
  // Liking shows at once; the server's count replaces the guess when it answers. The list keeps
  // its order until it is next loaded, so the card doesn't jump away under the pointer.
  const like = useMutation({
    mutationFn: toggleAnalysisLike,
    onMutate: (id: string) =>
      optimistic((a) =>
        a.id === id
          ? {
              ...a,
              liked_by_me: !a.liked_by_me,
              like_count: a.like_count + (a.liked_by_me ? -1 : 1),
            }
          : a,
      ),
    onSuccess: (res, id) =>
      patchAnalyses((a) =>
        a.id === id ? { ...a, liked_by_me: res.liked, like_count: res.like_count } : a,
      ),
    onError: (e, _id, ctx) => {
      rollback(ctx)
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
  const filterBy = (name: string | null, kind: TagKind = 'device') =>
    setParam(kind === 'device' ? 'tag' : 'who', name)
  const showAnalysesOf = (quoteId: string) => {
    setParam('quote', quoteId)
    requestAnimationFrame(() =>
      analysesAt.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }
  const total = data.data?.analysis_count ?? 0
  const filtering = !!tagFilter || !!whoFilter || !!quoteFilter
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
        <IntroBlock kind="work" subject={work.key} />
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
                  editions={editions}
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

      {/* Related tags: #devices and @characters */}
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t(`${K}.relatedTags`)}</h2>
          <p className="text-sm text-muted-foreground">{t(`${K}.relatedHint`)}</p>
        </div>
        {(['device', 'character'] as const).map((kind) => {
          const list = (data.data?.tags ?? []).filter((x) => x.kind === kind)
          const active = kind === 'device' ? tagFilter : whoFilter
          return (
            <div key={kind} className="flex flex-wrap items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
                {t(kind === 'device' ? `${K}.kindDeviceShort` : `${K}.kindCharacter`)}
              </span>
              {list.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  {t(kind === 'device' ? `${K}.noRelated` : `${K}.noCharacters`)}
                </span>
              )}
              {list.map((tag) => {
                const on = active?.toLowerCase() === tag.name.toLowerCase()
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => filterBy(on ? null : tag.name, kind)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      on
                        ? kind === 'device'
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-violet-600 bg-violet-600 text-white'
                        : kind === 'device'
                          ? 'border-border/70 hover:border-primary/60 hover:text-primary'
                          : 'border-border/70 hover:border-violet-400 hover:text-violet-700 dark:hover:text-violet-200',
                    )}
                  >
                    {TAG_SYMBOL[kind]}
                    {tag.name}
                    <span
                      className={cn('ml-1.5 text-xs', on ? 'opacity-80' : 'text-muted-foreground')}
                    >
                      {tag.count}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </section>

      {/* Analyses */}
      <section ref={analysesAt} className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              {t(`${K}.analyses`)}
              <span className="ml-2 text-base font-normal text-muted-foreground">{total}</span>
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

        {total > 0 && (
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
              onTag={(name, kind) => filterBy(name, kind)}
            />
          </div>
        )}
        {total > 0 && filtering && (
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
            {whoFilter && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 font-medium',
                  TAG_TONE.character,
                )}
              >
                @{whoFilter}
                <button
                  type="button"
                  aria-label={t(`${K}.removeFilter`)}
                  onClick={() => filterBy(null, 'character')}
                  className="grid size-5 place-items-center rounded-full hover:bg-black/10 dark:hover:bg-white/15"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            <span className="flex items-center gap-2 text-muted-foreground">
              {t(`${K}.matchCount`, { count: matching })}
              <button
                type="button"
                onClick={() =>
                  setParams(
                    (p) => {
                      const next = new URLSearchParams(p)
                      next.delete('tag')
                      next.delete('who')
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
        {total > 0 || list.data ? (
          analyses.length ? (
            <div className="space-y-4">
              {analyses.map((a) => (
                <AnalysisCard
                  key={a.id}
                  analysis={a}
                  versions={versions}
                  mine={a.author.id === userId}
                  deleting={removeAnalysis.isPending && removeAnalysis.variables === a.id}
                  onTag={(name, kind) => filterBy(name, kind)}
                  onLike={() => like.mutate(a.id)}
                  onCommentCount={(d) =>
                    patchAnalyses((x) =>
                      x.id === a.id ? { ...x, comment_count: x.comment_count + d } : x,
                    )
                  }
                  onDelete={() => removeAnalysis.mutate(a.id)}
                />
              ))}
              <div ref={listEnd} className="py-2 text-center text-sm text-muted-foreground">
                {isFetchingNextPage ? (
                  t('common.loading')
                ) : hasNextPage ? (
                  <Button variant="ghost" size="sm" onClick={() => void fetchNextPage()}>
                    {t(`${K}.loadMore`)}
                  </Button>
                ) : (
                  analyses.length > PAGE_SIZE && t(`${K}.allShown`, { count: analyses.length })
                )}
              </div>
            </div>
          ) : list.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : list.isError ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">
              {list.error instanceof Error ? list.error.message : t('common.error')}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => list.refetch()}
              >
                {t(`${K}.retry`)}
              </Button>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {filtering ? t(`${K}.noMatch`) : t(`${K}.noAnalyses`)}
            </p>
          )
        ) : null}
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

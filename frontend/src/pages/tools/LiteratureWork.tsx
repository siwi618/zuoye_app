import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Check, PenLine, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { createQuote, deleteAnalysis, deleteQuote, getWork, type QuoteRead } from '@/api/literature'
import { findWork } from '@/lib/literature/corpus'
import { PageLabel, QuoteText } from '@/components/literature/QuoteText'
import { AnalysisCard } from '@/components/literature/AnalysisCard'
import { AnalysisComposer } from '@/components/literature/AnalysisComposer'

const K = 'tools.literature'
// Quotes shown before「显示全部」.
const SHOWN_QUOTES = 5
const MAX_PICKED = 10

function QuoteForm({ workKey, onClose }: { workKey: string; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const from = Number(start)
  const to = end ? Number(end) : from
  const valid =
    body.trim() !== '' && Number.isInteger(from) && from >= 1 && Number.isInteger(to) && to >= from

  const add = useMutation({
    mutationFn: () => createQuote(workKey, { body: body.trim(), page_start: from, page_end: to }),
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
        <span className="text-sm font-medium">{t(`${K}.quoteBody`)}</span>
        <Textarea
          autoFocus
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t(`${K}.quotePlaceholder`)}
          className="min-h-28"
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">{t(`${K}.pageStart`)}</span>
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
          <span className="text-sm font-medium">{t(`${K}.pageEnd`)}</span>
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
        <p className="basis-full text-xs text-muted-foreground sm:basis-auto sm:flex-1">
          {t(`${K}.pageHint`)}
        </p>
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
}: {
  quote: QuoteRead
  picked: boolean
  canPick: boolean
  mine: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteQuote(q.id),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['literature-work', q.work_key] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })
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
        <PageLabel start={q.page_start} end={q.page_end} />
        <QuoteText body={q.body} />
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span>{t(`${K}.addedBy`, { name: q.author.display_name })}</span>
          {q.cited_count > 0 && <span>{t(`${K}.citedBy`, { count: q.cited_count })}</span>}
          {mine && q.cited_count === 0 && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => window.confirm(t(`${K}.deleteQuoteConfirm`)) && remove.mutate()}
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
  const [params, setParams] = useSearchParams()
  const tagFilter = params.get('tag')
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

  const removeAnalysis = useMutation({
    mutationFn: deleteAnalysis,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['literature-work', key] })
      void queryClient.invalidateQueries({ queryKey: ['literature-overview'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })

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
  const filterBy = (name: string | null) => setParams(name ? { tag: name } : {}, { replace: true })
  const analyses = (data.data?.analyses ?? []).filter(
    (a) => !tagFilter || a.tags.some((x) => x.name.toLowerCase() === tagFilter.toLowerCase()),
  )
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
        {adding && <QuoteForm workKey={work.key} onClose={() => setAdding(false)} />}
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
      <section className="space-y-4">
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

        {tagFilter && (
          <div className="flex items-center gap-2 text-sm">
            <span>{t(`${K}.filterOn`, { tag: `#${tagFilter}` })}</span>
            <button
              type="button"
              onClick={() => filterBy(null)}
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              <X className="size-3.5" />
              {t(`${K}.clearFilter`)}
            </button>
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
                  onDelete={() => removeAnalysis.mutate(a.id)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {tagFilter
                ? t(`${K}.noAnalysesForTag`, { tag: `#${tagFilter}` })
                : t(`${K}.noAnalyses`)}
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

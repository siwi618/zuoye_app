import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Brackets,
  Check,
  ListChecks,
  PenLine,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import {
  createQuote,
  deleteQuote,
  updateQuote,
  type QuoteRead,
  type WorkRead,
} from '@/api/literature'
import { useWorks, workByline } from '@/lib/literature/corpus'
import { workQuery } from '@/lib/literature/queries'
import {
  NOTE_CLOSE,
  NOTE_OPEN,
  TAG_SYMBOL,
  charLength,
  TAG_TONE,
  sliceChars,
  type TagKind,
} from '@/lib/literature/text'
import { PageLabel, QuoteText } from '@/components/literature/QuoteText'
import { AnalysisList } from '@/components/literature/AnalysisList'
import { useAnalysisList } from '@/lib/literature/analysisList'
import { AnalysisComposer } from '@/components/literature/AnalysisComposer'
import { AnalysisFilter } from '@/components/literature/AnalysisFilter'
import { IntroBlock } from '@/components/literature/IntroBlock'
import {
  QuoteBodyEditor,
  type QuoteBodyEditorHandle,
} from '@/components/literature/QuoteBodyEditor'
import { useRubberBand } from '@/lib/rubberBand'
import { useMediaQuery } from '@/lib/useMediaQuery'

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
  const editor = useRef<QuoteBodyEditorHandle>(null)
  // The words selected in the body, and while a note is being written for them, those words.
  const [selected, setSelected] = useState('')
  const [noting, setNoting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [start, setStart] = useState(initial ? String(initial.page_start) : '')
  const [end, setEnd] = useState(
    initial && initial.page_end !== initial.page_start ? String(initial.page_end) : '',
  )
  const [edition, setEdition] = useState(initial?.edition ?? '')
  const from = Number(start)
  const to = end ? Number(end) : from
  const valid =
    body.trim() !== '' &&
    charLength(body.trim()) <= 2000 &&
    Number.isInteger(from) &&
    from >= 1 &&
    Number.isInteger(to) &&
    to >= from

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

  // 「加注释」: select the words in the body (「你」), say who or what they mean, and the note goes
  // right after them as a grey chip: stored 「你〔王一生〕」.
  const shortWord = (w: string) => (charLength(w) > 12 ? `${sliceChars(w, 0, 12)}…` : w)
  const noteText = note.trim()
  const noteOk = noteText !== '' && !noteText.includes(NOTE_OPEN) && !noteText.includes(NOTE_CLOSE)
  const addNote = () => {
    if (noting === null || !noteOk) return
    editor.current?.insertNote(noteText)
    setNoting(null)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
      <div className="space-y-1.5">
        <div className="flex items-end justify-between gap-2">
          <span className="text-sm font-medium">{t(`${K}.quoteBody`)}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selected}
            // Keeps the editor's selection: a click on the button would otherwise clear it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setNoting(selected)
              setNote('')
            }}
            title={
              selected
                ? t(`${K}.addNoteFor`, { word: shortWord(selected) })
                : t(`${K}.addNoteSelectFirst`)
            }
          >
            <Brackets className="size-3.5" />
            {t(`${K}.addNote`)}
          </Button>
        </div>
        <QuoteBodyEditor
          ref={editor}
          initial={initial?.body ?? ''}
          placeholder={t(`${K}.quotePlaceholder`)}
          onChange={(v) => {
            setBody(v)
            setNoting(null)
          }}
          onSelect={setSelected}
        />
        {noting !== null && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/40 p-2">
            <span className="text-sm">{t(`${K}.noteFor`, { word: shortWord(noting) })}</span>
            <Input
              autoFocus
              value={note}
              maxLength={40}
              placeholder={t(`${K}.notePlaceholder`)}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault() // not the form's submit
                  addNote()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setNoting(null)
                  editor.current?.focus()
                }
              }}
              className="h-8 w-40 flex-1"
            />
            <Button type="button" size="sm" disabled={!noteOk} onClick={addNote}>
              {t(`${K}.noteConfirm`)}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setNoting(null)
                editor.current?.focus()
              }}
            >
              {t(`${K}.cancel`)}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t(`${K}.noteHint`)}</p>
      </div>
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
  flash,
  onToggle,
  onDelete,
  onShowAnalyses,
}: {
  quote: QuoteRead
  editions: string[]
  picked: boolean
  canPick: boolean
  mine: boolean
  flash: boolean // just jumped to
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
      data-quote={q.id}
      onClick={pickFromCard}
      className={cn(
        'flex cursor-pointer scroll-mt-24 gap-3 rounded-2xl border bg-card p-4 transition-[color,background-color,border-color,box-shadow] duration-500',
        picked ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40',
        !picked && !canPick && 'cursor-default',
        flash && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
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

// 「按页码跳转」: opens a small page box; Enter (or 跳转) goes to the quotes on that page.
function PageJump({ onJump }: { onJump: (page: number) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState('')
  const go = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(page)
    if (!Number.isInteger(n) || n < 1) return
    onJump(n)
  }
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Search className="size-4" />
        {t(`${K}.pageJump`)}
      </Button>
    )
  }
  return (
    <form onSubmit={go} className="flex items-center gap-1.5">
      <Input
        autoFocus
        type="number"
        inputMode="numeric"
        min={1}
        value={page}
        onChange={(e) => setPage(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder={t(`${K}.pagePlaceholder`)}
        aria-label={t(`${K}.pageJump`)}
        className="h-9 w-24"
      />
      <Button type="submit" disabled={!page}>
        {t(`${K}.pageJumpGo`)}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t(`${K}.cancel`)}
        onClick={() => {
          setOpen(false)
          setPage('')
        }}
      >
        <X className="size-4" />
      </Button>
    </form>
  )
}

// One work: students' quotes (by page), the #devices their analyses use (most used first), and
// the analyses themselves. Picking quotes and pressing「分享我自己的分析」opens the composer.
export function LiteratureWork() {
  const { key } = useParams<{ key: string }>()
  const works = useWorks()
  const work = works.find(key)
  // On a first visit the works list is still loading: fetch the page's data alongside it.
  const loadKey = key && (work || !works.ready) ? key : null
  const { t } = useTranslation()
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
  const [pickedOnly, setPickedOnly] = useState(false) //「我的选段」: just the ticked quotes
  const [flash, setFlash] = useState<string[]>([]) // quotes just jumped to, outlined for a moment
  const [composing, setComposing] = useState(false)
  const composerAt = useRef<HTMLDivElement>(null)
  // On a wide screen the tags and analyses sit beside the quotes in a box that scrolls on its own
  // (the quotes scroll with the page); on a phone everything stacks and scrolls with the page.
  const wide = useMediaQuery('(min-width: 64rem)')
  const side = useRef<HTMLDivElement>(null)
  useRubberBand(side, wide && !!work) // the box is there once the work is

  const data = useQuery({ ...workQuery(key ?? ''), enabled: !!loadKey })
  const quotes = useMemo(() => data.data?.quotes ?? [], [data.data])
  const byId = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes])

  // The analyses come a page at a time, sorted and filtered by the server.
  const analysisList = useAnalysisList(loadKey, {
    sort,
    tag: tagFilter,
    who: whoFilter,
    quote: quoteFilter,
  })
  const { matching } = analysisList
  // Editions already given for this work, most used first.
  const editions = useMemo(() => {
    const n = new Map<string, number>()
    for (const q of quotes) if (q.edition) n.set(q.edition, (n.get(q.edition) ?? 0) + 1)
    return [...n.keys()].sort((a, b) => n.get(b)! - n.get(a)!)
  }, [quotes])

  // A jump scrolls to its quote once it is on screen, and the outline fades after a moment.
  useEffect(() => {
    if (!flash.length) return
    document
      .querySelector(`[data-quote="${flash[0]}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const id = window.setTimeout(() => setFlash([]), 1800)
    return () => window.clearTimeout(id)
  }, [flash])

  const removeQuote = useRemove(key ?? '', deleteQuote, (w, id) => ({
    ...w,
    quotes: w.quotes.filter((q) => q.id !== id),
  }))

  if (!work && !works.ready) return <p className="text-muted-foreground">{t('common.loading')}</p>
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
  const onlyPicked = pickedOnly && pickedQuotes.length > 0
  const listed = onlyPicked ? pickedQuotes : quotes
  const shown = showAll || onlyPicked ? listed : listed.slice(0, SHOWN_QUOTES)
  // The quotes on that page, or else the nearest ones; brought into the list and outlined.
  const jumpTo = (page: number) => {
    const away = (q: QuoteRead) =>
      page < q.page_start ? q.page_start - page : page > q.page_end ? page - q.page_end : 0
    const nearest = Math.min(...quotes.map(away))
    const hits = quotes.filter((q) => away(q) === nearest)
    if (!hits.length) return
    if (nearest > 0) toast(t(`${K}.pageJumpNearest`, { page, near: pageText(hits[0]) }))
    if (onlyPicked && !hits.every((q) => picked.includes(q.id))) setPickedOnly(false)
    if (quotes.indexOf(hits[0]) >= SHOWN_QUOTES) setShowAll(true)
    setFlash(hits.map((q) => q.id))
  }
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
    <div className="mx-auto max-w-3xl space-y-10 pb-24 lg:max-w-6xl lg:pb-0">
      <div className="space-y-4 lg:max-w-3xl">
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
            {workByline(work)}
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

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-6">
        {/* Quotes */}
        <section className="min-w-0 space-y-4 lg:pb-24">
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
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {quotes.length > 0 && <PageJump onJump={jumpTo} />}
              {quotes.length > 0 && (
                <Button
                  variant={onlyPicked ? 'default' : 'outline'}
                  aria-pressed={onlyPicked}
                  disabled={!pickedQuotes.length}
                  title={pickedQuotes.length ? undefined : t(`${K}.myPicksNone`)}
                  onClick={() => setPickedOnly(!onlyPicked)}
                >
                  <ListChecks className="size-4" />
                  {t(`${K}.myPicks`)}
                  {pickedQuotes.length > 0 && (
                    <span className="text-xs opacity-80">{pickedQuotes.length}</span>
                  )}
                </Button>
              )}
              {!adding && (
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <Plus className="size-4" />
                  {t(`${K}.addQuote`)}
                </Button>
              )}
            </div>
          </div>
          {onlyPicked && (
            <p className="text-sm text-muted-foreground">
              {t(`${K}.myPicksShowing`, { count: pickedQuotes.length })}
              <button
                type="button"
                onClick={() => setPickedOnly(false)}
                className="ml-2 text-primary hover:underline"
              >
                {t(`${K}.myPicksAll`)}
              </button>
            </p>
          )}
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
                    flash={flash.includes(q.id)}
                    onToggle={() => toggle(q.id)}
                    onDelete={() => {
                      setPicked((p) => p.filter((x) => x !== q.id))
                      removeQuote.mutate(q.id)
                    }}
                    onShowAnalyses={() => showAnalysesOf(q.id)}
                  />
                ))}
              </ul>
              {!onlyPicked && quotes.length > SHOWN_QUOTES && (
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

        {/* Sticks under the header (5.5rem) and ends at the page's bottom margin (2.5rem), its
            border included; the room for the picked-quotes bar is inside the quotes column, so the
            page ends with the box still whole instead of pushing it up under the header. Clips the
            box while it gives at either end. */}
        <div className="min-w-0 lg:sticky lg:top-22 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-card">
          <div
            ref={side}
            className="space-y-10 lg:max-h-[calc(100dvh-8rem-2px)] lg:overflow-y-auto lg:overscroll-contain lg:p-5 lg:pb-20"
          >
            {/* Related tags: #devices and @characters */}
            <section className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">{t(`${K}.relatedTags`)}</h2>
                <p className="text-sm text-muted-foreground">{t(`${K}.relatedHint`)}</p>
              </div>
              {/* Labels in a column as wide as the longest one (「Characters」 in English). */}
              <div className="grid grid-cols-[max-content_1fr] items-start gap-x-3 gap-y-2">
                {(['device', 'character'] as const).map((kind) => {
                  const list = (data.data?.tags ?? []).filter((x) => x.kind === kind)
                  const active = kind === 'device' ? tagFilter : whoFilter
                  return (
                    <Fragment key={kind}>
                      <span className="flex h-7.5 items-center text-xs font-medium text-muted-foreground">
                        {t(kind === 'device' ? `${K}.kindDeviceShort` : `${K}.kindCharacter`)}
                      </span>
                      <div className="flex min-h-7.5 min-w-0 flex-wrap items-center gap-2">
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
                                className={cn(
                                  'ml-1.5 text-xs',
                                  on ? 'opacity-80' : 'text-muted-foreground',
                                )}
                              >
                                {tag.count}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </Fragment>
                  )
                })}
              </div>
            </section>

            {/* Analyses */}
            <section ref={analysesAt} className="scroll-mt-24 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">
                    {t(`${K}.analyses`)}
                    <span className="ml-2 text-base font-normal text-muted-foreground">
                      {total}
                    </span>
                  </h2>
                  {!composing && (
                    <p className="text-sm text-muted-foreground">
                      {picked.length
                        ? t(`${K}.selectedCount`, { count: picked.length })
                        : t(wide ? `${K}.pickFirstSide` : `${K}.pickFirst`)}
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
                  <Select
                    value={sort}
                    onValueChange={(v) => setParam('sort', v === 'hot' ? null : v)}
                  >
                    <SelectTrigger aria-label={t(`${K}.sortLabel`)} className="w-auto min-w-28">
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
              {total > 0 && (
                <AnalysisList
                  state={analysisList}
                  scroller={wide ? side : undefined}
                  empty={filtering ? t(`${K}.noMatch`) : t(`${K}.noAnalyses`)}
                  onTag={(name, kind) => filterBy(name, kind)}
                />
              )}
              {total === 0 && data.data && (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {t(`${K}.noAnalyses`)}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>

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

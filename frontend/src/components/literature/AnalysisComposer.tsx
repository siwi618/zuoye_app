import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Highlighter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  createAnalysis,
  updateAnalysis,
  type AnalysisRead,
  type ComposerQuote,
  type Highlight,
} from '@/api/literature'
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_TONE,
  cleanTag,
  isValidTag,
  parseBody,
  fragmentOf,
  noteGroups,
  noteRoles,
  sliceChars,
  TAG_SYMBOL,
  TAG_TONE,
  toCharOffset,
  type HighlightColor,
  type TagKind,
} from '@/lib/literature/text'
import { cn } from '@/lib/utils'
import { NotedText, PageLabel, QuoteText } from './QuoteText'
import { BodyEditor, type BodyEditorHandle } from './BodyEditor'
import { TagPicker } from './TagPicker'

const K = 'tools.literature'

// The highlighter colour is remembered for the next fragment, here and next time.
const PEN_KEY = 'coral.literature.pen'
const lastPen = (): HighlightColor => {
  try {
    const c = localStorage.getItem(PEN_KEY)
    return HIGHLIGHT_COLORS.find((x) => x === c) ?? 'amber'
  } catch {
    return 'amber'
  }
}

function ColorDots({
  value,
  onChange,
  label,
}: {
  value: HighlightColor
  onChange: (c: HighlightColor) => void
  label: (c: HighlightColor) => string
}) {
  return (
    <span className="flex shrink-0 items-center gap-1" role="radiogroup">
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={label(c)}
          title={label(c)}
          onClick={() => onChange(c)}
          className={cn(
            'size-4 rounded-full border border-black/10 transition-transform hover:scale-110',
            HIGHLIGHT_TONE[c].swatch,
            value === c && 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-card',
          )}
        />
      ))}
    </span>
  )
}

// A selection inside one of the quotes, in character offsets, and where to show its button
// (relative to the composer).
interface Pending {
  quoteId: string
  start: number
  end: number
  x: number
  y: number
}

// Writing an analysis of the quotes picked on the work page: highlight fragments of them as
// 「引文1」「引文2」…, tag the devices used, then write the analysis referring to both.
// With `initial`, the author edits that analysis instead, on the quote versions it was written on.
export function AnalysisComposer({
  workKey,
  quotes,
  initial,
  onUnpick,
  onCancel,
  onDone,
}: {
  workKey: string
  quotes: ComposerQuote[] // the picked quotes (or the analysis's own versions), in page order
  initial?: AnalysisRead
  onUnpick: (quoteId: string) => void
  onCancel: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const box = useRef<HTMLDivElement>(null)
  const editor = useRef<BodyEditorHandle>(null)
  const [marks, setMarks] = useState<Highlight[]>(initial?.highlights ?? [])
  const initialOf = (kind: TagKind) =>
    initial?.tags.filter((x) => x.kind === kind).map((x) => x.name) ?? []
  const [tags, setTags] = useState<string[]>(initialOf('device'))
  const [characters, setCharacters] = useState<string[]>(initialOf('character'))
  const [body, setBody] = useState(initial?.body ?? '')
  const [pending, setPending] = useState<Pending | null>(null)
  const [pen, setPen] = useState<HighlightColor>(lastPen)
  const bar = useRef<HTMLDivElement>(null)

  // The pen's bar sits over the selection, but kept inside the composer: next to its edge it
  // would stick out, and the work page's side box clips what does.
  useLayoutEffect(() => {
    const el = bar.current
    const host = box.current
    if (!pending || !el || !host) return
    const half = el.offsetWidth / 2 + 4 // and a little clear of the border
    el.style.left = `${Math.min(Math.max(pending.x, half), host.clientWidth - half)}px`
  })
  const [error, setError] = useState<string | null>(null)

  // Fragments of quotes that were unpicked meanwhile no longer count.
  const picked = new Set(quotes.map((q) => q.id))
  const highlights = marks.filter((h) => picked.has(h.quote_id))
  const nextNumber = Math.max(0, ...marks.map((h) => h.number)) + 1

  // Follow the reader's text selection; only a selection within a single quote counts.
  useEffect(() => {
    const update = () => {
      const sel = document.getSelection()
      const host = box.current
      if (!sel || sel.isCollapsed || !sel.rangeCount || !host) return setPending(null)
      const range = sel.getRangeAt(0)
      const quoteOf = (n: Node) =>
        (n instanceof Element ? n : n.parentElement)?.closest<HTMLElement>('[data-quote-id]')
      const el = quoteOf(range.startContainer)
      if (!el || el !== quoteOf(range.endContainer) || !host.contains(el)) return setPending(null)
      const before = document.createRange()
      before.selectNodeContents(el)
      before.setEnd(range.startContainer, range.startOffset)
      const text = el.textContent ?? ''
      const from = before.toString().length
      let start = toCharOffset(text, from)
      let end = toCharOffset(text, from + range.toString().length)
      const chars = Array.from(text)
      while (start < end && /\s/.test(chars[start])) start++
      while (end > start && /\s/.test(chars[end - 1])) end--
      if (end <= start) return setPending(null)
      const rect = range.getBoundingClientRect()
      const origin = host.getBoundingClientRect()
      setPending({
        quoteId: el.dataset.quoteId!,
        start,
        end,
        x: rect.left + rect.width / 2 - origin.left,
        y: rect.top - origin.top,
      })
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  const overlap =
    pending &&
    highlights.find(
      (h) => h.quote_id === pending.quoteId && h.start < pending.end && pending.start < h.end,
    )

  const mark = () => {
    if (!pending || overlap) return
    setMarks((m) => [
      ...m,
      {
        quote_id: pending.quoteId,
        number: nextNumber,
        start: pending.start,
        end: pending.end,
        color: pen,
      },
    ])
    document.getSelection()?.removeAllRanges()
    setPending(null)
  }

  const choosePen = (c: HighlightColor) => {
    setPen(c)
    try {
      localStorage.setItem(PEN_KEY, c)
    } catch {
      // storage unavailable: the colour just isn't remembered
    }
  }
  const recolor = (n: number, color: HighlightColor) =>
    setMarks((m) => m.map((h) => (h.number === n ? { ...h, color } : h)))

  const publish = useMutation({
    mutationFn: async (payload: { tags: string[]; characters: string[] }) => {
      const analysis = {
        quote_ids: quotes.map((q) => q.id),
        highlights,
        tags: payload.tags,
        characters: payload.characters,
        body: body.trim(),
      }
      if (initial) await updateAnalysis(initial.id, analysis)
      else await createAnalysis(workKey, analysis)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['literature-work', workKey] })
      void queryClient.invalidateQueries({ queryKey: ['literature-analyses', workKey] })
      void queryClient.invalidateQueries({ queryKey: ['literature-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['literature-tags'] })
      toast.success(t(initial ? `${K}.analysisUpdated` : `${K}.published`))
      onDone()
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.error')),
  })

  const submit = () => {
    setError(null)
    const parts = parseBody(body)
    // Tags written into the text count as tags of the analysis too.
    const all = { device: [...tags], character: [...characters] }
    for (const p of parts) {
      if (p.type !== 'tag') continue
      const name = cleanTag(p.name)
      const list = all[p.kind]
      if (isValidTag(name) && !list.some((x) => x.toLowerCase() === name.toLowerCase()))
        list.push(name)
    }
    const numbers = new Set(highlights.map((h) => h.number))
    const missing = parts.find((p) => p.type === 'quote' && !numbers.has(p.number))
    if (!body.trim()) return setError(t(`${K}.needBody`))
    if (body.trim().length > 5000) return setError(t(`${K}.bodyTooLong`, { count: 5000 }))
    if (!all.device.length) return setError(t(`${K}.needTag`))
    if (all.device.length > 8 || all.character.length > 8)
      return setError(t(`${K}.maxTags`, { count: 8 }))
    if (missing?.type === 'quote') return setError(t(`${K}.unknownRef`, { n: missing.number }))
    publish.mutate({ tags: all.device, characters: all.character })
  }

  // What each「引文N」will read as once published.
  const fragments = new Map(
    highlights.flatMap((h) => {
      const q = quotes.find((x) => x.id === h.quote_id)
      return q ? [[h.number, fragmentOf(q.body, h.start, h.end, h.color)] as const] : []
    }),
  )
  const byNumber = [...highlights].sort((a, b) => a.number - b.number)

  return (
    <div
      ref={box}
      className="relative space-y-6 rounded-2xl border border-primary/40 bg-card p-5 shadow-soft"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">
          {t(initial ? `${K}.editAnalysisTitle` : `${K}.composeTitle`)}
        </h3>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
          {t(`${K}.cancel`)}
        </Button>
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-medium">{t(`${K}.step1`)}</h4>
        {quotes.map((q) => (
          <div key={q.id} className="rounded-xl bg-secondary/60 p-3">
            <div className="mb-1 flex items-center gap-2">
              <PageLabel start={q.page_start} end={q.page_end} edition={q.edition} />
              <button
                type="button"
                onClick={() => onUnpick(q.id)}
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
                {t(`${K}.removeQuote`)}
              </button>
            </div>
            <QuoteText
              data-quote-id={q.id}
              body={q.body}
              spans={highlights.filter((h) => h.quote_id === q.id)}
              // What is being selected shows in the pen's colour, as it will once marked.
              className={HIGHLIGHT_TONE[pen].selection}
            />
          </div>
        ))}
        {byNumber.length > 0 ? (
          <ul className="space-y-1.5">
            {byNumber.map((h) => {
              const q = quotes.find((x) => x.id === h.quote_id)!
              return (
                <li key={h.number} className="flex items-start gap-2 text-sm">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.current?.insertQuote(h.number)}
                    title={t(`${K}.insertRef`)}
                    className={cn(
                      'shrink-0 rounded-md px-1.5 py-0.5 font-medium hover:brightness-95',
                      HIGHLIGHT_TONE[h.color ?? 'amber'].mark,
                      HIGHLIGHT_TONE[h.color ?? 'amber'].number,
                    )}
                  >
                    {t(`${K}.quoteRef`, { n: h.number })}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    「
                    <NotedText
                      text={sliceChars(q.body, h.start, h.end)}
                      roles={noteRoles(q.body)}
                      groups={noteGroups(q.body)}
                      at={h.start}
                    />
                    」
                  </span>
                  <ColorDots
                    value={h.color ?? 'amber'}
                    onChange={(c) => recolor(h.number, c)}
                    label={(c) => t(`${K}.colorOf`, { n: h.number, color: t(`${K}.color_${c}`) })}
                  />
                  <button
                    type="button"
                    aria-label={t(`${K}.removeHighlight`, { n: h.number })}
                    onClick={() => setMarks((m) => m.filter((x) => x.number !== h.number))}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t(`${K}.noHighlights`)}</p>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">{t(`${K}.step2`)}</h4>
        <div className="grid gap-2 sm:grid-cols-[max-content_1fr] sm:items-start sm:gap-x-3">
          <span className="pt-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
            {t(`${K}.kindDeviceShort`)}
          </span>
          <TagPicker value={tags} onChange={setTags} />
          <span className="pt-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
            {t(`${K}.kindCharacter`)}
            <span className="ml-1 font-normal">{t(`${K}.optional`)}</span>
          </span>
          <TagPicker
            kind="character"
            workKey={workKey}
            value={characters}
            onChange={setCharacters}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">{t(`${K}.step3`)}</h4>
        {(tags.length > 0 || characters.length > 0 || byNumber.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{t(`${K}.insert`)}</span>
            {[
              ...tags.map((name) => ({ kind: 'device' as const, name })),
              ...characters.map((name) => ({ kind: 'character' as const, name })),
            ].map((tag) => (
              <button
                key={`${tag.kind}:${tag.name}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.current?.insertTag(tag.kind, tag.name)}
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-medium hover:brightness-95',
                  TAG_TONE[tag.kind],
                )}
              >
                {TAG_SYMBOL[tag.kind]}
                {tag.name}
              </button>
            ))}
            {byNumber.map((h) => (
              <button
                key={h.number}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.current?.insertQuote(h.number)}
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-medium hover:brightness-95',
                  HIGHLIGHT_TONE[h.color ?? 'amber'].mark,
                  HIGHLIGHT_TONE[h.color ?? 'amber'].number,
                )}
              >
                {t(`${K}.quoteRef`, { n: h.number })}
              </button>
            ))}
          </div>
        )}
        <BodyEditor
          ref={editor}
          initial={body}
          fragments={fragments}
          placeholder={t(`${K}.bodyPlaceholder`)}
          onChange={setBody}
        />
        <p className="text-xs text-muted-foreground">{t(`${K}.editorHint`)}</p>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t(`${K}.cancel`)}
        </Button>
        <Button onClick={submit} disabled={publish.isPending}>
          {publish.isPending
            ? t(`${K}.publishing`)
            : t(initial ? `${K}.saveAnalysis` : `${K}.publish`)}
        </Button>
      </div>

      {pending && (
        <div
          ref={bar}
          className="absolute z-30 -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: pending.x, top: pending.y }}
        >
          {overlap ? (
            <span className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background shadow-soft-lg">
              {t(`${K}.overlap`, { n: overlap.number })}
            </span>
          ) : (
            // Keep the selection: a press would otherwise clear it before the click.
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-1 pl-2.5 shadow-soft-lg"
            >
              <ColorDots
                value={pen}
                onChange={choosePen}
                label={(c) => t(`${K}.penColor`, { color: t(`${K}.color_${c}`) })}
              />
              <Button size="sm" className="h-7 rounded-full" onClick={mark}>
                <Highlighter className="size-4" />
                {t(`${K}.markAs`, { n: nextNumber })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

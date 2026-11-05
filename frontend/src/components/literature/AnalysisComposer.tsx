import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Highlighter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createAnalysis, type Highlight, type QuoteRead } from '@/api/literature'
import {
  cleanTag,
  isValidTag,
  parseBody,
  quoteToken,
  sliceChars,
  tagToken,
  toCharOffset,
} from '@/lib/literature/text'
import { AnalysisBody, PageLabel, QuoteText } from './QuoteText'
import { TagPicker } from './TagPicker'

const K = 'tools.literature'

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
export function AnalysisComposer({
  workKey,
  quotes,
  onUnpick,
  onCancel,
  onDone,
}: {
  workKey: string
  quotes: QuoteRead[] // the picked quotes, in page order
  onUnpick: (quoteId: string) => void
  onCancel: () => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const box = useRef<HTMLDivElement>(null)
  const editor = useRef<HTMLTextAreaElement>(null)
  const [marks, setMarks] = useState<Highlight[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [body, setBody] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
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
      { quote_id: pending.quoteId, number: nextNumber, start: pending.start, end: pending.end },
    ])
    document.getSelection()?.removeAllRanges()
    setPending(null)
  }

  // Insert a reference at the caret (or over the selected text) of the editor. The caret is put
  // back right after the new text is rendered, before any further keystroke lands.
  const caret = useRef<number | null>(null)
  const insert = (token: string) => {
    const el = editor.current
    const from = el?.selectionStart ?? body.length
    const to = el?.selectionEnd ?? body.length
    caret.current = from + token.length
    setBody(body.slice(0, from) + token + body.slice(to))
  }
  useLayoutEffect(() => {
    if (caret.current === null) return
    editor.current?.focus()
    editor.current?.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [body])

  const publish = useMutation({
    mutationFn: (payload: { tags: string[] }) =>
      createAnalysis(workKey, {
        quote_ids: quotes.map((q) => q.id),
        highlights,
        tags: payload.tags,
        body: body.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['literature-work', workKey] })
      void queryClient.invalidateQueries({ queryKey: ['literature-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['literature-tags'] })
      toast.success(t(`${K}.published`))
      onDone()
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.error')),
  })

  const submit = () => {
    setError(null)
    const parts = parseBody(body)
    // Tags written into the text count as tags of the analysis too.
    const all = [...tags]
    for (const p of parts) {
      const name = p.type === 'tag' ? cleanTag(p.name) : ''
      if (isValidTag(name) && !all.some((x) => x.toLowerCase() === name.toLowerCase()))
        all.push(name)
    }
    const numbers = new Set(highlights.map((h) => h.number))
    const missing = parts.find((p) => p.type === 'quote' && !numbers.has(p.number))
    if (!body.trim()) return setError(t(`${K}.needBody`))
    if (!all.length) return setError(t(`${K}.needTag`))
    if (all.length > 8) return setError(t(`${K}.maxTags`, { count: 8 }))
    if (missing?.type === 'quote') return setError(t(`${K}.unknownRef`, { n: missing.number }))
    publish.mutate({ tags: all })
  }

  const numbers = new Set(highlights.map((h) => h.number))
  const byNumber = [...highlights].sort((a, b) => a.number - b.number)

  return (
    <div
      ref={box}
      className="relative space-y-6 rounded-2xl border border-primary/40 bg-card p-5 shadow-soft"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">{t(`${K}.composeTitle`)}</h3>
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
              className="selection:bg-amber-300/60"
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
                    onClick={() => insert(quoteToken(h.number, i18n.language))}
                    title={t(`${K}.insertRef`)}
                    className="shrink-0 rounded-md bg-amber-200/70 px-1.5 py-0.5 font-medium text-amber-800 hover:bg-amber-300/70 dark:bg-amber-400/25 dark:text-amber-200"
                  >
                    {t(`${K}.quoteRef`, { n: h.number })}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    「{sliceChars(q.body, h.start, h.end)}」
                  </span>
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
        <TagPicker value={tags} onChange={setTags} />
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">{t(`${K}.step3`)}</h4>
        {(tags.length > 0 || byNumber.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{t(`${K}.insert`)}</span>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(tagToken(tag, i18n.language))}
                className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/20"
              >
                #{tag}
              </button>
            ))}
            {byNumber.map((h) => (
              <button
                key={h.number}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(quoteToken(h.number, i18n.language))}
                className="rounded-md bg-amber-200/70 px-1.5 py-0.5 font-medium text-amber-800 hover:bg-amber-300/70 dark:bg-amber-400/25 dark:text-amber-200"
              >
                {t(`${K}.quoteRef`, { n: h.number })}
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={editor}
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t(`${K}.bodyPlaceholder`)}
          className="min-h-36"
        />
        {body.trim() && (
          <div className="rounded-xl border border-dashed border-border p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {t(`${K}.preview`)}
            </div>
            <AnalysisBody body={body} numbers={numbers} />
          </div>
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t(`${K}.cancel`)}
        </Button>
        <Button onClick={submit} disabled={publish.isPending}>
          {publish.isPending ? t(`${K}.publishing`) : t(`${K}.publish`)}
        </Button>
      </div>

      {pending && (
        <div
          className="absolute z-30 -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: pending.x, top: pending.y }}
        >
          {overlap ? (
            <span className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background shadow-soft-lg">
              {t(`${K}.overlap`, { n: overlap.number })}
            </span>
          ) : (
            <Button
              size="sm"
              className="rounded-full shadow-soft-lg"
              // Keep the selection: a press would otherwise clear it before the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={mark}
            >
              <Highlighter className="size-4" />
              {t(`${K}.markAs`, { n: nextNumber })}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

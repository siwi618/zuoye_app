import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, Pencil, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AnalysisRead, QuoteVersion } from '@/api/literature'
import { sliceChars } from '@/lib/literature/text'
import { AnalysisBody, PageLabel, QuoteText } from './QuoteText'
import { AnalysisComposer } from './AnalysisComposer'

const K = 'tools.literature'

// A published analysis, as it was written: it shows the version of each quote it was written on.
// Above the text, one label per fragment (「第 12 页 · 引文1」) that opens the whole quote; in the
// text, each「引文N」reads as the fragment's words. Hovering one lights up the other.
export function AnalysisCard({
  analysis: a,
  versions,
  mine,
  deleting,
  onTag,
  onLike,
  onDelete,
}: {
  analysis: AnalysisRead
  versions: Map<string, QuoteVersion>
  mine: boolean
  deleting: boolean
  onTag: (name: string) => void
  onLike: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [lit, setLit] = useState<number | null>(null)
  // The covered quote whose whole text is unfolded under the labels, if any.
  const [open, setOpen] = useState<string | null>(null)
  // quote id → the version of it this analysis cites
  const quoteOf = new Map(
    a.quotes.flatMap((c) => {
      const v = versions.get(c.version_id)
      return v ? [[c.quote_id, v] as const] : []
    }),
  )
  const covered = [...quoteOf.values()]
  const fragments = new Map(
    a.highlights.flatMap((h) => {
      const q = quoteOf.get(h.quote_id)
      return q ? [[h.number, sliceChars(q.body, h.start, h.end)] as const] : []
    }),
  )
  const pages = (q: { page_start: number; page_end: number }) =>
    q.page_start === q.page_end
      ? t(`${K}.pageOne`, { start: q.page_start })
      : t(`${K}.pageRange`, { start: q.page_start, end: q.page_end })
  // One label per fragment (by number); a quote covered without any fragment gets one of its own.
  const labels = [
    ...[...a.highlights]
      .sort((x, y) => x.number - y.number)
      .flatMap((h) => {
        const q = quoteOf.get(h.quote_id)
        return q ? [{ key: `n${h.number}`, quote: q, number: h.number as number | null }] : []
      }),
    ...covered
      .filter((q) => !a.highlights.some((h) => h.quote_id === q.quote_id))
      .map((q) => ({ key: q.quote_id, quote: q, number: null })),
  ]
  const unfolded = open ? quoteOf.get(open) : undefined

  // The author edits in place, on the versions the analysis cites; dropping a quote there only
  // takes effect when saved.
  const [editing, setEditing] = useState<string[] | null>(null)
  if (editing) {
    const own = covered
      .filter((v) => editing.includes(v.quote_id))
      .map((v) => ({ ...v, id: v.quote_id }))
    return (
      <AnalysisComposer
        workKey={a.work_key}
        quotes={own}
        initial={a}
        onUnpick={(id) => setEditing((ids) => ids && ids.filter((x) => x !== id))}
        onCancel={() => setEditing(null)}
        onDone={() => setEditing(null)}
      />
    )
  }

  return (
    <article className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Avatar className="size-7">
          <AvatarFallback className="bg-brand-100 text-[11px] font-semibold text-brand-700">
            {a.author.display_name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium text-foreground">{a.author.display_name}</span>
        <span>{new Date(a.created_at).toLocaleDateString()}</span>
        {mine && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1.5 text-muted-foreground hover:text-primary"
            onClick={() => setEditing(covered.map((v) => v.quote_id))}
          >
            <Pencil className="size-4" />
            {t(`${K}.editAnalysis`)}
          </Button>
        )}
        {mine && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            disabled={deleting}
            onClick={() => window.confirm(t(`${K}.deleteAnalysisConfirm`)) && onDelete()}
          >
            <Trash2 className="size-4" />
            {t(`${K}.delete`)}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {a.tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => onTag(tag.name)}
            className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary hover:bg-primary/20"
          >
            #{tag.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => {
            const on = open === l.quote.quote_id
            return (
              <button
                key={l.key}
                type="button"
                aria-expanded={on}
                title={t(on ? `${K}.hideQuote` : `${K}.showQuote`)}
                onClick={() => setOpen(on ? null : l.quote.quote_id)}
                onMouseEnter={() => l.number !== null && setLit(l.number)}
                onMouseLeave={() => setLit(null)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs tabular-nums transition-colors',
                  on
                    ? 'border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100'
                    : 'border-border/70 text-muted-foreground hover:border-amber-400 hover:text-foreground',
                  l.number !== null && lit === l.number && 'border-amber-500 ring-1 ring-amber-500',
                )}
              >
                {pages(l.quote)}
                {l.number !== null && ` · ${t(`${K}.quoteRef`, { n: l.number })}`}
              </button>
            )
          })}
        </div>
        {unfolded && (
          <blockquote className="rounded-xl border-l-4 border-amber-300 bg-secondary/50 px-3 py-2">
            <PageLabel
              start={unfolded.page_start}
              end={unfolded.page_end}
              edition={unfolded.edition}
            />
            <QuoteText
              body={unfolded.body}
              spans={a.highlights.filter((h) => h.quote_id === unfolded.quote_id)}
              lit={lit}
            />
          </blockquote>
        )}
      </div>

      <AnalysisBody body={a.body} fragments={fragments} lit={lit} onTag={onTag} onQuote={setLit} />

      <Button
        variant="outline"
        size="sm"
        aria-pressed={a.liked_by_me}
        aria-label={t(a.liked_by_me ? `${K}.unlike` : `${K}.like`)}
        onClick={onLike}
        className={cn('gap-1.5 rounded-full', a.liked_by_me && 'border-rose-200 text-rose-600')}
      >
        <Heart className={cn('size-4', a.liked_by_me && 'fill-rose-500 text-rose-500')} />
        {a.like_count}
      </Button>
    </article>
  )
}

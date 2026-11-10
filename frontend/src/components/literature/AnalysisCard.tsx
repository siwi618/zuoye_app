import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AnalysisRead, QuoteVersion } from '@/api/literature'
import {
  HIGHLIGHT_TONE,
  TAG_SYMBOL,
  TAG_TONE,
  fragmentOf,
  type HighlightColor,
  type TagKind,
} from '@/lib/literature/text'
import { AnalysisBody, PageLabel, QuoteText } from './QuoteText'
import { AnalysisComposer } from './AnalysisComposer'
import { AnalysisComments } from './AnalysisComments'
import { BadgeTag } from '@/components/BadgeTag'

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
  onCommentCount,
  onDelete,
}: {
  analysis: AnalysisRead
  versions: Map<string, QuoteVersion>
  mine: boolean
  deleting: boolean
  onTag: (name: string, kind: TagKind) => void
  onLike: () => void
  onCommentCount: (delta: number) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [lit, setLit] = useState<number | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  // The covered quote whose whole text is unfolded under the labels, if any.
  // The page label clicked open (one quote can have several, in different colours).
  const [open, setOpen] = useState<{
    key: string
    quoteId: string
    color: HighlightColor | null
  } | null>(null)
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
      return q ? [[h.number, fragmentOf(q.body, h.start, h.end, h.color)] as const] : []
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
        return q
          ? [
              {
                key: `n${h.number}`,
                quote: q,
                number: h.number as number | null,
                color: h.color ?? ('amber' as HighlightColor),
              },
            ]
          : []
      }),
    ...covered
      .filter((q) => !a.highlights.some((h) => h.quote_id === q.quote_id))
      .map((q) => ({ key: q.quote_id, quote: q, number: null, color: null })),
  ]
  const unfolded = open ? quoteOf.get(open.quoteId) : undefined

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
        <BadgeTag badge={a.author.worn_badge} />
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
        {[...a.tags]
          .sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'device' ? -1 : 1))
          .map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onTag(tag.name, tag.kind)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-sm font-medium hover:brightness-95',
                TAG_TONE[tag.kind],
              )}
            >
              {TAG_SYMBOL[tag.kind]}
              {tag.name}
            </button>
          ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => {
            const on = open?.key === l.key
            const tone = l.color ? HIGHLIGHT_TONE[l.color] : null
            return (
              <button
                key={l.key}
                type="button"
                aria-expanded={on}
                title={t(on ? `${K}.hideQuote` : `${K}.showQuote`)}
                onClick={() =>
                  setOpen(on ? null : { key: l.key, quoteId: l.quote.quote_id, color: l.color })
                }
                onMouseEnter={() => l.number !== null && setLit(l.number)}
                onMouseLeave={() => setLit(null)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs tabular-nums transition-colors',
                  // In the fragment's own colour; a quote covered without fragments stays grey.
                  on
                    ? (tone?.chip ?? 'border-foreground/40 bg-secondary text-foreground')
                    : [
                        'border-border/70 text-muted-foreground hover:text-foreground',
                        tone?.hover ?? 'hover:border-foreground/40',
                      ],
                  l.number !== null &&
                    lit === l.number &&
                    l.color && [
                      'ring-1',
                      HIGHLIGHT_TONE[l.color].ring,
                      HIGHLIGHT_TONE[l.color].border,
                    ],
                )}
              >
                {l.color && (
                  <span
                    aria-hidden
                    className={cn(
                      'mr-1 inline-block size-2 rounded-full align-middle',
                      HIGHLIGHT_TONE[l.color].swatch,
                    )}
                  />
                )}
                {pages(l.quote)}
                {l.number !== null && ` · ${t(`${K}.quoteRef`, { n: l.number })}`}
              </button>
            )
          })}
        </div>
        {unfolded && (
          <blockquote
            className={cn(
              'rounded-xl border-l-4 bg-secondary/50 px-3 py-2',
              open?.color ? HIGHLIGHT_TONE[open.color].bar : 'border-border',
            )}
          >
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

      <div className="flex items-center gap-2">
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
        <Button
          variant="outline"
          size="sm"
          aria-expanded={commentsOpen}
          aria-label={t(`${K}.comments`, { count: a.comment_count })}
          onClick={() => setCommentsOpen(!commentsOpen)}
          className={cn('gap-1.5 rounded-full', commentsOpen && 'border-primary/50 text-primary')}
        >
          <MessageCircle className="size-4" />
          {a.comment_count}
        </Button>
      </div>
      {commentsOpen && <AnalysisComments analysisId={a.id} onCount={onCommentCount} />}
    </article>
  )
}

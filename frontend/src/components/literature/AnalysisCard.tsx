import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { AnalysisRead, QuoteRead } from '@/api/literature'
import { AnalysisBody, PageLabel, QuoteText } from './QuoteText'

const K = 'tools.literature'

// A published analysis: the quotes it covers with its fragments marked, its tags, and the text.
// Hovering a「引文N」reference lights up that fragment above.
export function AnalysisCard({
  analysis: a,
  quotes,
  mine,
  deleting,
  onTag,
  onDelete,
}: {
  analysis: AnalysisRead
  quotes: Map<string, QuoteRead>
  mine: boolean
  deleting: boolean
  onTag: (name: string) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [lit, setLit] = useState<number | null>(null)
  const numbers = new Set(a.highlights.map((h) => h.number))

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
            className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
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
        {a.quote_ids.map((id) => {
          const q = quotes.get(id)
          if (!q) return null
          return (
            <blockquote
              key={id}
              className="rounded-xl border-l-4 border-amber-300 bg-secondary/50 px-3 py-2"
            >
              <PageLabel start={q.page_start} end={q.page_end} />
              <QuoteText
                body={q.body}
                spans={a.highlights.filter((h) => h.quote_id === id)}
                lit={lit}
              />
            </blockquote>
          )
        })}
      </div>

      <AnalysisBody body={a.body} numbers={numbers} onTag={onTag} onQuote={setLit} />
    </article>
  )
}

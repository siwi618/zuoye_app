import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { QuoteRead, TagRead } from '@/api/literature'
import { PageLabel } from './QuoteText'

const K = 'tools.literature'
const MAX_ROWS = 8

type Scope = 'quote' | 'tag'
type Row = { kind: 'quote'; quote: QuoteRead; snippet: string } | { kind: 'tag'; tag: TagRead }

// A stretch of the quote around the first match (or its opening), so the reader sees why it
// matched.
function snippet(body: string, query: string) {
  const chars = Array.from(body)
  const at = query ? Array.from(body.slice(0, Math.max(body.indexOf(query), 0))).length : 0
  const from = Math.max(0, at - 6)
  const text = chars.slice(from, from + 26).join('')
  return `${from > 0 ? '…' : ''}${text}${from + 26 < chars.length ? '…' : ''}`
}

// One search box for filtering the analyses: choose whether to search the quotes (their text or
// page number; only quotes some analysis cites) or the #devices, then pick a match.
export function AnalysisFilter({
  quotes,
  tags,
  onQuote,
  onTag,
}: {
  quotes: QuoteRead[] // the quotes cited by at least one analysis
  tags: TagRead[] // the work's tags, most used first
  onQuote: (id: string) => void
  onTag: (name: string) => void
}) {
  const { t } = useTranslation()
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [scope, setScope] = useState<Scope>('quote')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const q = query.trim().toLowerCase().replace(/^#/, '')
  const rows: Row[] =
    scope === 'quote'
      ? quotes
          .filter(
            (x) =>
              !q ||
              x.body.toLowerCase().includes(q) ||
              (/^\d+$/.test(q) && x.page_start <= Number(q) && Number(q) <= x.page_end) ||
              (x.edition ?? '').toLowerCase().includes(q),
          )
          .slice(0, MAX_ROWS)
          .map((quote) => ({ kind: 'quote', quote, snippet: snippet(quote.body, query.trim()) }))
      : tags
          .filter((x) => !q || x.name.toLowerCase().includes(q))
          .slice(0, MAX_ROWS)
          .map((tag) => ({ kind: 'tag', tag }))
  const at = Math.min(active, rows.length - 1)

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }
  const choose = (row: Row) => {
    if (row.kind === 'quote') onQuote(row.quote.id)
    else onTag(row.tag.name)
    close()
    input.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      if (rows.length) setActive((at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length)
    } else if (e.key === 'Enter' && open && rows[at]) {
      e.preventDefault()
      choose(rows[at])
    } else if (e.key === 'Escape' && open) {
      close()
    }
  }

  return (
    <div className="relative min-w-0 flex-1 basis-64">
      <div className="flex h-9 items-center rounded-full border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <Select
          value={scope}
          onValueChange={(v) => {
            setScope(v as Scope)
            setActive(0)
          }}
        >
          <SelectTrigger
            aria-label={t(`${K}.searchScope`)}
            className="h-full w-auto shrink-0 gap-1 rounded-l-full rounded-r-none border-0 border-r border-border bg-transparent pr-2 pl-3.5 text-sm shadow-none focus-visible:ring-0"
          >
            <SelectValue />
          </SelectTrigger>
          {/* After picking where to search, go straight on typing (Radix would focus the trigger). */}
          <SelectContent
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              input.current?.focus()
            }}
          >
            <SelectItem value="quote">{t(`${K}.scopeQuote`)}</SelectItem>
            <SelectItem value="tag">{t(`${K}.scopeTag`)}</SelectItem>
          </SelectContent>
        </Select>
        <Search className="ml-2.5 size-4 shrink-0 text-muted-foreground" />
        <input
          ref={input}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[at] ? `${listId}-${at}` : undefined}
          aria-label={t(scope === 'quote' ? `${K}.searchQuotes` : `${K}.searchTags`)}
          value={query}
          placeholder={t(scope === 'quote' ? `${K}.searchQuotes` : `${K}.searchTags`)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent pr-3.5 pl-2 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && (
        <div
          id={listId}
          role="listbox"
          // Keep the focus in the box while a row is pressed, so blur doesn't close the list
          // before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-soft-lg"
        >
          {rows.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {query.trim()
                ? t(`${K}.searchEmpty`, { query: query.trim() })
                : t(scope === 'quote' ? `${K}.noCitedQuotes` : `${K}.noRelated`)}
            </p>
          )}
          {rows.map((row, i) => (
            <div
              key={row.kind === 'quote' ? row.quote.id : row.tag.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === at}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(row)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1.5 text-sm',
                i === at && 'bg-secondary',
              )}
            >
              {row.kind === 'quote' ? (
                <>
                  <PageLabel
                    start={row.quote.page_start}
                    end={row.quote.page_end}
                    edition={row.quote.edition}
                  />
                  <div className="truncate">{row.snippet}</div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-medium">#{row.tag.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t(`${K}.analysisCount`, { count: row.tag.count })}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

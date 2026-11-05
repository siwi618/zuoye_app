import { Fragment, type HTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { parseBody, segments, type Span } from '@/lib/literature/text'

const K = 'tools.literature'

export function PageLabel({ start, end }: { start: number; end: number }) {
  const { t } = useTranslation()
  return (
    <span className="text-xs font-medium text-muted-foreground tabular-nums">
      {start === end ? t(`${K}.pageOne`, { start }) : t(`${K}.pageRange`, { start, end })}
    </span>
  )
}

// A quote with its highlighted fragments marked like a highlighter pen. The fragment's number is
// drawn by a pseudo-element, so it is not part of the text a reader selects (the composer maps a
// selection back to character offsets in the quote).
export function QuoteText({
  body,
  spans = [],
  lit,
  className,
  ...props
}: {
  body: string
  spans?: Span[]
  lit?: number | null // the fragment to emphasise, e.g. while its reference is hovered
} & HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('whitespace-pre-wrap text-[15px] leading-7', className)} {...props}>
      {segments(body, spans).map((s, i) =>
        s.number === undefined ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : (
          <mark
            key={i}
            data-n={s.number}
            className={cn(
              'rounded-sm bg-amber-200/70 px-0.5 text-foreground transition-shadow dark:bg-amber-400/25',
              'before:mr-0.5 before:align-super before:text-[10px] before:font-semibold before:text-amber-700 before:content-[attr(data-n)] dark:before:text-amber-300',
              lit === s.number && 'ring-2 ring-amber-500',
            )}
          >
            {s.text}
          </mark>
        ),
      )}
    </p>
  )
}

// An analysis body with its「（#tag）」and「（引文N）」references drawn as chips.
export function AnalysisBody({
  body,
  numbers,
  onTag,
  onQuote,
}: {
  body: string
  numbers: Set<number> // fragments that exist; other references stay plain text
  onTag?: (name: string) => void
  onQuote?: (n: number | null) => void
}) {
  const { t } = useTranslation()
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">
      {parseBody(body).map((part, i) => {
        if (part.type === 'text') return <Fragment key={i}>{part.text}</Fragment>
        if (part.type === 'tag')
          return (
            <button
              key={i}
              type="button"
              disabled={!onTag}
              onClick={() => onTag?.(part.name)}
              className="mx-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-medium text-primary enabled:hover:bg-primary/20"
            >
              #{part.name}
            </button>
          )
        if (!numbers.has(part.number))
          return <Fragment key={i}>{t(`${K}.quoteRef`, { n: part.number })}</Fragment>
        return (
          <span
            key={i}
            tabIndex={onQuote ? 0 : undefined}
            onMouseEnter={() => onQuote?.(part.number)}
            onMouseLeave={() => onQuote?.(null)}
            onFocus={() => onQuote?.(part.number)}
            onBlur={() => onQuote?.(null)}
            className="mx-0.5 cursor-default rounded-md bg-amber-200/70 px-1.5 py-0.5 text-sm font-medium text-amber-800 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-400/25 dark:text-amber-200"
          >
            {t(`${K}.quoteRef`, { n: part.number })}
          </span>
        )
      })}
    </p>
  )
}

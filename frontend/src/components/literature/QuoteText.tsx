import { Fragment, useState, type HTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  HIGHLIGHT_TONE,
  NOTE_ANCHOR,
  NOTE_CHIP,
  TAG_SYMBOL,
  TAG_TONE,
  noteRuns,
  parseBody,
  scanNotes,
  type NoteRole,
  quoteMarks,
  type HighlightColor,
  segments,
  type Span,
  type TagKind,
} from '@/lib/literature/text'

const K = 'tools.literature'

// 「第 12–13 页 · 人民文学出版社 2010」: the pages, and the edition they refer to if given.
export function PageLabel({
  start,
  end,
  edition,
}: {
  start: number
  end: number
  edition?: string | null
}) {
  const { t } = useTranslation()
  return (
    <span className="text-xs font-medium text-muted-foreground tabular-nums">
      {start === end ? t(`${K}.pageOne`, { start }) : t(`${K}.pageRange`, { start, end })}
      {edition && <span className="font-normal"> · {edition}</span>}
    </span>
  )
}

// Text of a quote with its notes drawn: the words a note explains underlined, the note a grey
// chip after them (a student's words, not the book's). A click on the words folds the note away
// and another brings it back. The marks 〔 ｜ 〕, and a folded note, stay in the text, hidden, so
// the text (and the offsets a selection maps to) is the quote's own. `roles` and `groups` may be
// those of the whole quote this text starts `at` characters into; `folded` and `onFold` share
// the folding with the rest of it (otherwise this text keeps its own).
export function NotedText({
  text,
  roles,
  groups,
  at,
  folded,
  onFold,
}: {
  text: string
  roles?: NoteRole[]
  groups?: number[]
  at?: number
  folded?: ReadonlySet<number>
  onFold?: (group: number) => void
}) {
  const { t } = useTranslation()
  const [own, setOwn] = useState<ReadonlySet<number>>(new Set())
  const shut = folded ?? own
  const fold =
    onFold ??
    ((g: number) =>
      setOwn((s) => {
        const next = new Set(s)
        if (!next.delete(g)) next.add(g)
        return next
      }))
  const runs = noteRuns(text, roles, at, groups)
  // Only words whose note is there to fold can be clicked.
  const withNote = new Set(runs.filter((r) => r.role === 'note').map((r) => r.group))
  return runs.map((r, i) => {
    if (r.role === 'text') return <Fragment key={i}>{r.text}</Fragment>
    if (r.role === 'mark')
      return (
        <span key={i} className="hidden">
          {r.text}
        </span>
      )
    if (r.role === 'note')
      return (
        <span
          key={i}
          title={t(`${K}.noteTitle`)}
          className={cn(NOTE_CHIP, shut.has(r.group) && 'hidden')}
        >
          {r.text}
        </span>
      )
    if (!withNote.has(r.group))
      return (
        <span key={i} className={NOTE_ANCHOR}>
          {r.text}
        </span>
      )
    const open = !shut.has(r.group)
    const toggle = (e: React.SyntheticEvent) => {
      e.stopPropagation() // not the quote card's pick
      if (document.getSelection()?.toString()) return // selecting text, not clicking
      fold(r.group)
    }
    return (
      <span
        key={i}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title={t(open ? `${K}.noteFold` : `${K}.noteUnfold`)}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          toggle(e)
        }}
        className={cn(
          NOTE_ANCHOR,
          'cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        {r.text}
      </span>
    )
  })
}

// A quote with its highlighted fragments marked like a highlighter pen. Each fragment's number,
// in front of it as in the analysis text, is drawn by a pseudo-element, so it is not part of the
// text a reader selects (the composer maps a selection back to character offsets).
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
  const { roles, groups } = scanNotes(body)
  // Notes folded away, by where they start: shared by the pieces the fragments cut the quote into.
  const [folded, setFolded] = useState<ReadonlySet<number>>(new Set())
  const onFold = (g: number) =>
    setFolded((s) => {
      const next = new Set(s)
      if (!next.delete(g)) next.add(g)
      return next
    })
  const parts = segments(body, spans)
  // where each segment starts in the body, for its notes
  const starts = parts.map((_, i) =>
    parts.slice(0, i).reduce((n, p) => n + Array.from(p.text).length, 0),
  )
  return (
    <p className={cn('whitespace-pre-wrap text-[15px] leading-7', className)} {...props}>
      {parts.map((s, i) => {
        const from = starts[i]
        return s.number === undefined ? (
          <NotedText
            key={i}
            text={s.text}
            roles={roles}
            groups={groups}
            at={from}
            folded={folded}
            onFold={onFold}
          />
        ) : (
          <mark
            key={i}
            data-n={s.number}
            className={cn(
              'rounded-sm px-0.5 text-foreground transition-shadow',
              'before:mr-0.5 before:align-super before:text-[10px] before:font-semibold before:content-[attr(data-n)]',
              HIGHLIGHT_TONE[s.color ?? 'amber'].mark,
              HIGHLIGHT_TONE[s.color ?? 'amber'].before,
              lit === s.number && ['ring-2', HIGHLIGHT_TONE[s.color ?? 'amber'].ring],
            )}
          >
            <NotedText
              text={s.text}
              roles={roles}
              groups={groups}
              at={from}
              folded={folded}
              onFold={onFold}
            />
          </mark>
        )
      })}
    </p>
  )
}

// An analysis body: 「（#tag）」「（@character）」 references drawn as chips, and 「（引文N）」 replaced by the words of
// that fragment, highlighted, with its number in front.
export function AnalysisBody({
  body,
  fragments,
  lit,
  onTag,
  onQuote,
}: {
  body: string
  // fragment number → its words and colour; other references stay as typed
  fragments: Map<
    number,
    { text: string; color?: HighlightColor; roles?: NoteRole[]; groups?: number[] }
  >
  lit?: number | null
  onTag?: (name: string, kind: TagKind) => void
  onQuote?: (n: number | null) => void
}) {
  const { t } = useTranslation()
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">
      {parseBody(body).map((part, i, parts) => {
        if (part.type === 'text') return <Fragment key={i}>{part.text}</Fragment>
        if (part.type === 'tag')
          return (
            <button
              key={i}
              type="button"
              disabled={!onTag}
              onClick={() => onTag?.(part.name, part.kind)}
              className={cn(
                'mx-0.5 rounded-md px-1.5 py-0.5 text-sm font-medium enabled:hover:brightness-95',
                TAG_TONE[part.kind],
              )}
            >
              {TAG_SYMBOL[part.kind]}
              {part.name}
            </button>
          )
        const fragment = fragments.get(part.number)
        if (fragment === undefined)
          return <Fragment key={i}>{t(`${K}.quoteRef`, { n: part.number })}</Fragment>
        const near = (p?: (typeof parts)[number]) => (p?.type === 'text' ? p.text : '')
        const marks = quoteMarks(fragment.text, near(parts[i - 1]), near(parts[i + 1]))
        return (
          <mark
            key={i}
            tabIndex={onQuote ? 0 : undefined}
            onMouseEnter={() => onQuote?.(part.number)}
            onMouseLeave={() => onQuote?.(null)}
            onFocus={() => onQuote?.(part.number)}
            onBlur={() => onQuote?.(null)}
            className={cn(
              'rounded-sm px-0.5 text-foreground outline-none transition-shadow',
              HIGHLIGHT_TONE[fragment.color ?? 'amber'].mark,
              lit === part.number && ['ring-2', HIGHLIGHT_TONE[fragment.color ?? 'amber'].ring],
            )}
          >
            <sup
              className={cn(
                'mr-0.5 text-[10px] font-semibold',
                HIGHLIGHT_TONE[fragment.color ?? 'amber'].number,
              )}
            >
              {part.number}
            </sup>
            {marks.open}
            <NotedText text={fragment.text} roles={fragment.roles} groups={fragment.groups} />
            {marks.close}
          </mark>
        )
      })}
    </p>
  )
}

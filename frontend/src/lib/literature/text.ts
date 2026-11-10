// Text helpers for quotes and analyses. Highlight offsets count characters (code points), the way
// the backend's len() does, so a rare character outside the BMP never shifts a fragment.

export const charLength = (s: string) => Array.from(s).length

// A UTF-16 offset (what DOM ranges give) as a character offset.
export const toCharOffset = (s: string, utf16: number) => charLength(s.slice(0, utf16))

export const sliceChars = (s: string, start: number, end?: number) =>
  Array.from(s).slice(start, end).join('')

// Notes in a quote: 「〔你｜王一生〕」, words a student added to say who or what 「你」 means once the
// passage is cut out of the book: the words explained, 「｜」, then the note (an older note, 「你〔王一生〕」,
// has no words of its own). They are part of the quote's text, so fragment offsets and versions
// work as before; the words explained are underlined, the note is a grey chip, and the brackets
// and the bar stay in the text, hidden.
export const NOTE_OPEN = '〔'
export const NOTE_CLOSE = '〕'
export const NOTE_SEP = '｜'
export const NOTE_CHIP =
  'mx-0.5 inline-block cursor-default rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium leading-5 text-muted-foreground'
export const NOTE_ANCHOR =
  'underline decoration-muted-foreground/70 decoration-dotted decoration-2 underline-offset-4'
// The longest note, and the longest run of words one explains.
export const NOTE_MAX = 40
export const NOTE_ANCHOR_MAX = 20

// The note in stored form.
export const noteToken = (note: string, anchor?: string) =>
  NOTE_OPEN + (anchor ? anchor + NOTE_SEP : '') + note + NOTE_CLOSE

// What each character of a quote is: the book's words, words a note explains, the note, or a
// hidden mark (〔 ｜ 〕).
export type NoteRole = 'text' | 'anchor' | 'note' | 'mark'

export function noteRoles(text: string): NoteRole[] {
  const chars = Array.from(text)
  const roles: NoteRole[] = chars.map(() => 'text')
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== NOTE_OPEN) continue
    let close = -1
    for (let j = i + 1; j < chars.length && chars[j] !== NOTE_OPEN; j++)
      if (chars[j] === NOTE_CLOSE) {
        close = j
        break
      }
    if (close < 0) continue // a lone 〔 is just a character
    const sep = chars.slice(i + 1, close).indexOf(NOTE_SEP) + i + 1
    roles[i] = roles[close] = 'mark'
    for (let k = i + 1; k < close; k++)
      roles[k] = sep > i ? (k < sep ? 'anchor' : k === sep ? 'mark' : 'note') : 'note'
    i = close
  }
  return roles
}

// `text` split into runs by role; `roles` (from noteRoles) may be those of a longer text this one
// starts `at` characters into, e.g. a fragment's within its quote.
export function noteRuns(text: string, roles = noteRoles(text), at = 0) {
  const runs: { text: string; role: NoteRole }[] = []
  Array.from(text).forEach((c, i) => {
    const role = roles[at + i] ?? 'text'
    const last = runs[runs.length - 1]
    if (last && last.role === role) last.text += c
    else runs.push({ text: c, role })
  })
  return runs
}

// A fragment of a quote: its words and colour, and the roles of its characters as they are in
// the whole quote (a fragment may cut a note in two).
export function fragmentOf(body: string, start: number, end: number, color?: HighlightColor) {
  return { text: sliceChars(body, start, end), color, roles: noteRoles(body).slice(start, end) }
}

// Highlighter colours for fragments: yellow (the default), light blue, pink, light green. Class
// names are spelled out in full so Tailwind finds them.
export type HighlightColor = 'amber' | 'sky' | 'pink' | 'lime'
export const HIGHLIGHT_COLORS: HighlightColor[] = ['amber', 'sky', 'pink', 'lime']
export const HIGHLIGHT_TONE: Record<
  HighlightColor,
  {
    mark: string
    number: string
    before: string
    swatch: string
    ring: string
    border: string
    chip: string // a page label while its quote is unfolded
    hover: string // a page label under the pointer
    bar: string // the unfolded quote's side bar
  }
> = {
  amber: {
    mark: 'bg-amber-200/70 dark:bg-amber-400/25',
    number: 'text-amber-700 dark:text-amber-300',
    before: 'before:text-amber-700 dark:before:text-amber-300',
    swatch: 'bg-amber-300',
    ring: 'ring-amber-500',
    border: 'border-amber-400',
    chip: 'border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100',
    hover: 'hover:border-amber-400',
    bar: 'border-amber-300',
  },
  sky: {
    mark: 'bg-sky-200/70 dark:bg-sky-400/25',
    number: 'text-sky-700 dark:text-sky-300',
    before: 'before:text-sky-700 dark:before:text-sky-300',
    swatch: 'bg-sky-300',
    ring: 'ring-sky-500',
    border: 'border-sky-400',
    chip: 'border-sky-400 bg-sky-100 text-sky-900 dark:bg-sky-400/20 dark:text-sky-100',
    hover: 'hover:border-sky-400',
    bar: 'border-sky-300',
  },
  pink: {
    mark: 'bg-pink-200/70 dark:bg-pink-400/25',
    number: 'text-pink-700 dark:text-pink-300',
    before: 'before:text-pink-700 dark:before:text-pink-300',
    swatch: 'bg-pink-300',
    ring: 'ring-pink-500',
    border: 'border-pink-400',
    chip: 'border-pink-400 bg-pink-100 text-pink-900 dark:bg-pink-400/20 dark:text-pink-100',
    hover: 'hover:border-pink-400',
    bar: 'border-pink-300',
  },
  lime: {
    mark: 'bg-lime-200/80 dark:bg-lime-400/25',
    number: 'text-lime-800 dark:text-lime-300',
    before: 'before:text-lime-800 dark:before:text-lime-300',
    swatch: 'bg-lime-300',
    ring: 'ring-lime-600',
    border: 'border-lime-500',
    chip: 'border-lime-500 bg-lime-100 text-lime-900 dark:bg-lime-400/20 dark:text-lime-100',
    hover: 'hover:border-lime-500',
    bar: 'border-lime-400',
  },
}

export interface Span {
  start: number
  end: number
  number: number
  color?: HighlightColor
}

// A quote cut into plain runs and highlighted fragments, in reading order.
export function segments(body: string, spans: Span[]) {
  const chars = Array.from(body)
  const out: { text: string; number?: number; color?: HighlightColor }[] = []
  let at = 0
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    if (s.start > at) out.push({ text: chars.slice(at, s.start).join('') })
    out.push({ text: chars.slice(s.start, s.end).join(''), number: s.number, color: s.color })
    at = s.end
  }
  if (at < chars.length) out.push({ text: chars.slice(at).join('') })
  return out
}

// Two kinds of tag: #devices, shared by every work, and @characters, which belong to one work.
export type TagKind = 'device' | 'character'
export const TAG_SYMBOL: Record<TagKind, string> = { device: '#', character: '@' }
// Chip colours: devices in the brand green, characters in violet.
export const TAG_TONE: Record<TagKind, string> = {
  device: 'bg-primary/10 text-primary',
  character: 'bg-violet-100 text-violet-700 dark:bg-violet-400/20 dark:text-violet-200',
}

// Tag names: no "#", "@", brackets or spaces, which would break a「(#tag)」「(@name)」reference.
export const TAG_MAX = 20
export const cleanTag = (raw: string) => raw.trim().replace(/^[#@]+/, '')
export const isValidTag = (name: string) =>
  name.length > 0 && charLength(name) <= TAG_MAX && !/[#@()（）\s]/.test(name)

// References in an analysis: 「（#意象）」, 「（@王一生）」 and 「（引文1）」, with half- or
// full-width brackets; 「(Quote 1)」 is the English spelling of the last.
const TOKEN = /[(（]\s*(?:([#@])([^()（）\s#@]+)|(?:引文|Quote\s*)(\d+))\s*[)）]/g

export type BodyPart =
  | { type: 'text'; text: string }
  | { type: 'tag'; kind: TagKind; name: string }
  | { type: 'quote'; number: number }

export function parseBody(body: string): BodyPart[] {
  const parts: BodyPart[] = []
  let at = 0
  for (const m of body.matchAll(TOKEN)) {
    if (m.index > at) parts.push({ type: 'text', text: body.slice(at, m.index) })
    parts.push(
      m[1]
        ? { type: 'tag', kind: m[1] === '@' ? 'character' : 'device', name: m[2] }
        : { type: 'quote', number: Number(m[3]) },
    )
    at = m.index + m[0].length
  }
  if (at < body.length) parts.push({ type: 'text', text: body.slice(at) })
  return parts
}

const zh = (lang: string) => lang.startsWith('zh')
export const tagToken = (name: string, lang: string, kind: TagKind = 'device') => {
  const ref = `${TAG_SYMBOL[kind]}${name}`
  return zh(lang) ? `（${ref}）` : `(${ref})`
}
export const quoteToken = (n: number, lang: string) => (zh(lang) ? `（引文${n}）` : `(Quote ${n})`)

// A cited fragment reads in double quotes, unless the quote marks are already there: in the
// fragment itself, or typed around the reference in the text.
const OPENS = /[“「『"]/
const CLOSES = /[”」』"]/
export function quoteMarks(fragment: string, before: string, after: string) {
  return {
    open: !(OPENS.test(before.slice(-1)) || OPENS.test(fragment.slice(0, 1))) ? '“' : '',
    close: !(CLOSES.test(after.slice(0, 1)) || CLOSES.test(fragment.slice(-1))) ? '”' : '',
  }
}

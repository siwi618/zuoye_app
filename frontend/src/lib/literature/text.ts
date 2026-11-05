// Text helpers for quotes and analyses. Highlight offsets count characters (code points), the way
// the backend's len() does, so a rare character outside the BMP never shifts a fragment.

export const charLength = (s: string) => Array.from(s).length

// A UTF-16 offset (what DOM ranges give) as a character offset.
export const toCharOffset = (s: string, utf16: number) => charLength(s.slice(0, utf16))

export const sliceChars = (s: string, start: number, end?: number) =>
  Array.from(s).slice(start, end).join('')

// Highlighter colours for fragments: yellow (the default), light blue, pink, light green. Class
// names are spelled out in full so Tailwind finds them.
export type HighlightColor = 'amber' | 'sky' | 'pink' | 'lime'
export const HIGHLIGHT_COLORS: HighlightColor[] = ['amber', 'sky', 'pink', 'lime']
export const HIGHLIGHT_TONE: Record<
  HighlightColor,
  { mark: string; number: string; before: string; swatch: string; ring: string; border: string }
> = {
  amber: {
    mark: 'bg-amber-200/70 dark:bg-amber-400/25',
    number: 'text-amber-700 dark:text-amber-300',
    before: 'before:text-amber-700 dark:before:text-amber-300',
    swatch: 'bg-amber-300',
    ring: 'ring-amber-500',
    border: 'border-amber-400',
  },
  sky: {
    mark: 'bg-sky-200/70 dark:bg-sky-400/25',
    number: 'text-sky-700 dark:text-sky-300',
    before: 'before:text-sky-700 dark:before:text-sky-300',
    swatch: 'bg-sky-300',
    ring: 'ring-sky-500',
    border: 'border-sky-400',
  },
  pink: {
    mark: 'bg-pink-200/70 dark:bg-pink-400/25',
    number: 'text-pink-700 dark:text-pink-300',
    before: 'before:text-pink-700 dark:before:text-pink-300',
    swatch: 'bg-pink-300',
    ring: 'ring-pink-500',
    border: 'border-pink-400',
  },
  lime: {
    mark: 'bg-lime-200/80 dark:bg-lime-400/25',
    number: 'text-lime-800 dark:text-lime-300',
    before: 'before:text-lime-800 dark:before:text-lime-300',
    swatch: 'bg-lime-300',
    ring: 'ring-lime-600',
    border: 'border-lime-500',
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

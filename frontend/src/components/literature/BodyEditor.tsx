import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  HIGHLIGHT_TONE,
  TAG_SYMBOL,
  TAG_TONE,
  parseBody,
  quoteToken,
  tagToken,
  type HighlightColor,
  type TagKind,
} from '@/lib/literature/text'

const K = 'tools.literature'

export interface BodyEditorHandle {
  insertTag: (kind: TagKind, name: string) => void
  insertQuote: (n: number) => void
}

type Fragments = Map<number, { text: string; color?: HighlightColor }>

// 「#意象」 or 「@王一生」 just typed and ended by a space or punctuation mark: becomes a chip.
const TYPED_TAG =
  /([#@])([^#@()（）\s，,。.！!？?；;：:、“”"'「」]{1,20})([\s，,。.！!？?；;：:、])$/
// A whole reference typed or pasted: 「（#意象）」「（@王一生）」「（引文1）」.
const TYPED_TOKEN = /[(（]\s*(?:([#@])([^()（）\s#@]{1,20})|(?:引文|Quote\s*)(\d+))\s*[)）]$/
const ZWSP = '​' // keeps a caret line after a trailing line break; never saved

const CHIP = 'mx-0.5 inline-block cursor-default rounded-md px-1.5 py-0.5 text-sm font-medium'

// The analysis text as it reads once published: #devices and @characters as chips, (引文N) as
// the fragment's words. Chips are single, non-editable pieces, so Backspace removes one whole.
// The value is kept as plain text with tokens (「（#意象）」「（引文1）」), the stored format.
export function BodyEditor({
  ref,
  initial,
  fragments,
  placeholder,
  onChange,
}: {
  ref?: Ref<BodyEditorHandle>
  initial: string
  fragments: Fragments
  placeholder: string
  onChange: (body: string) => void
}) {
  const { t, i18n } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const range = useRef<Range | null>(null)
  const composing = useRef(false)
  const lang = i18n.language

  const chip = (kind: TagKind | 'quote', value: string | number): HTMLSpanElement => {
    const el = document.createElement('span')
    el.contentEditable = 'false'
    el.dataset.kind = kind
    if (kind === 'quote') el.dataset.n = String(value)
    else el.dataset.name = String(value)
    paint(el)
    return el
  }

  // Draws a chip; quote chips follow their fragment (its words and colour) as it changes.
  const paint = (el: HTMLElement) => {
    const kind = el.dataset.kind as TagKind | 'quote'
    if (kind !== 'quote') {
      el.className = cn(CHIP, TAG_TONE[kind])
      el.textContent = `${TAG_SYMBOL[kind]}${el.dataset.name}`
      return
    }
    const n = Number(el.dataset.n)
    const f = fragments.get(n)
    if (!f) {
      el.className = cn(CHIP, 'border border-dashed border-border text-muted-foreground')
      el.textContent = t(`${K}.quoteRef`, { n })
      return
    }
    const tone = HIGHLIGHT_TONE[f.color ?? 'amber']
    el.className = cn(CHIP, 'font-normal text-foreground', tone.mark)
    el.replaceChildren()
    const sup = document.createElement('sup')
    sup.className = cn('mr-0.5 text-[10px] font-semibold', tone.number)
    sup.textContent = String(n)
    el.append(sup, f.text)
  }

  const nodesFor = (text: string): Node[] =>
    parseBody(text).map((p) =>
      p.type === 'text'
        ? document.createTextNode(p.text)
        : p.type === 'tag'
          ? chip(p.kind, p.name)
          : chip('quote', p.number),
    )

  // The editor's content as stored text.
  const serialize = (node: Node): string => {
    let out = ''
    node.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) out += (c.textContent ?? '').replaceAll(ZWSP, '')
      else if (c instanceof HTMLElement && c.dataset.kind) {
        out +=
          c.dataset.kind === 'quote'
            ? quoteToken(Number(c.dataset.n), lang)
            : tagToken(c.dataset.name!, lang, c.dataset.kind as TagKind)
      } else if (c instanceof HTMLBRElement) out += '\n'
      else if (c instanceof HTMLElement)
        out += (out && !out.endsWith('\n') ? '\n' : '') + serialize(c)
    })
    return out
  }

  const emit = () => {
    const el = root.current
    if (!el) return
    const text = serialize(el)
    // An emptied editor keeps no stray <br>, so its placeholder shows again.
    if (!text.trim() && el.childNodes.length && !el.querySelector('[data-kind]'))
      el.replaceChildren()
    onChange(text)
  }

  const placeCaretAfter = (node: Node) => {
    const r = document.createRange()
    r.setStartAfter(node)
    r.collapse(true)
    const sel = document.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
    range.current = r.cloneRange()
  }

  // Puts nodes where the caret is (or was, before a button took the focus), or at the end.
  const insertNodes = (nodes: Node[]) => {
    const el = root.current
    if (!el || !nodes.length) return
    el.focus()
    let r = range.current
    if (!r || !el.contains(r.commonAncestorContainer)) {
      r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(false)
    }
    r.deleteContents()
    const frag = document.createDocumentFragment()
    nodes.forEach((n) => frag.append(n))
    const last = nodes[nodes.length - 1]
    r.insertNode(frag)
    placeCaretAfter(last)
    emit()
  }

  useImperativeHandle(ref, () => ({
    insertTag: (kind, name) => insertNodes([chip(kind, name)]),
    insertQuote: (n) => insertNodes([chip('quote', n)]),
  }))

  // Built once from the initial text; afterwards the DOM is the source of truth.
  useEffect(() => {
    const el = root.current
    if (!el) return
    el.replaceChildren(...nodesFor(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quote chips follow their fragments (re-marked, recoloured or removed).
  useEffect(() => {
    root.current?.querySelectorAll<HTMLElement>('[data-kind="quote"]').forEach(paint)
  })

  // Remember the caret while the editor has it, for the insert buttons.
  useEffect(() => {
    const keep = () => {
      const sel = document.getSelection()
      if (sel?.rangeCount && root.current?.contains(sel.getRangeAt(0).commonAncestorContainer))
        range.current = sel.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', keep)
    return () => document.removeEventListener('selectionchange', keep)
  }, [])

  // Turns what was just typed before the caret into a chip, if it is a tag or a reference.
  const convert = () => {
    const sel = document.getSelection()
    if (!sel?.rangeCount || !sel.isCollapsed) return
    const { startContainer: node, startOffset: at } = sel.getRangeAt(0)
    if (node.nodeType !== Node.TEXT_NODE || !root.current?.contains(node)) return
    const text = node.textContent ?? ''
    const before = text.slice(0, at)
    const tag = TYPED_TAG.exec(before)
    const token = TYPED_TOKEN.exec(before)
    const m = token ?? tag
    if (!m) return
    let made: Node
    let tail = ''
    if (token) {
      made = token[3]
        ? chip('quote', Number(token[3]))
        : chip(token[1] === '@' ? 'character' : 'device', token[2])
    } else {
      made = chip(tag![1] === '@' ? 'character' : 'device', tag![2])
      // A space only ended the tag; a punctuation mark is part of the sentence.
      tail = /\s/.test(tag![3]) ? '' : tag![3]
    }
    const start = before.length - m[0].length
    const rest = document.createTextNode(tail + text.slice(at))
    node.textContent = text.slice(0, start)
    node.parentNode!.insertBefore(rest, node.nextSibling)
    node.parentNode!.insertBefore(made, rest)
    const r = document.createRange()
    r.setStart(rest, tail.length)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  }

  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    // While an input method is composing (pinyin…), wait for the characters to be chosen.
    if (composing.current || (e.nativeEvent as InputEvent).isComposing) return
    convert()
    emit()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    const el = root.current!
    const atEnd = (() => {
      const sel = document.getSelection()
      if (!sel?.rangeCount) return true
      const r = document.createRange()
      r.selectNodeContents(el)
      r.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset)
      return !r.toString().replaceAll(ZWSP, '') && !r.cloneContents().querySelector?.('[data-kind]')
    })()
    insertNodes([document.createTextNode(atEnd ? `\n${ZWSP}` : '\n')])
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    insertNodes(nodesFor(e.clipboardData.getData('text/plain')))
  }

  return (
    <div
      ref={root}
      role="textbox"
      aria-multiline
      aria-label={placeholder}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false
        convert()
        emit()
      }}
      className={cn(
        'min-h-36 w-full rounded-md border border-input bg-transparent px-3 py-2 text-[15px] leading-8 whitespace-pre-wrap outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]',
      )}
    />
  )
}

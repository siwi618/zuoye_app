import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import {
  NOTE_ANCHOR,
  NOTE_ANCHOR_MAX,
  NOTE_CHIP,
  NOTE_CLOSE,
  NOTE_MAX,
  NOTE_OPEN,
  NOTE_SEP,
  charLength,
  noteToken,
} from '@/lib/literature/text'

const K = 'tools.literature'

export interface QuoteBodyEditorHandle {
  // Notes the words selected last: they and the note become one piece.
  insertNote: (note: string) => void
  focus: () => void
}

// A note, 「〔你｜王一生〕」 or an older 「〔王一生〕」; typed (up to its closing 〕) it becomes a piece.
const NOTE_BODY = `(?:([^${NOTE_OPEN}${NOTE_CLOSE}${NOTE_SEP}\\n]{1,${NOTE_ANCHOR_MAX}})${NOTE_SEP})?([^${NOTE_OPEN}${NOTE_CLOSE}${NOTE_SEP}\\n]{1,${NOTE_MAX}})`
const TYPED_NOTE = new RegExp(`${NOTE_OPEN}${NOTE_BODY}${NOTE_CLOSE}$`)
const NOTES = new RegExp(`${NOTE_OPEN}${NOTE_BODY}${NOTE_CLOSE}`, 'g')
const ZWSP = '​' // keeps a caret line after a piece or a trailing line break; never saved

// Words that can be noted: some text, on one line, not taking in a note already there.
function notable(range: Range) {
  const text = range.toString().replaceAll(ZWSP, '')
  if (range.cloneContents().querySelector('[data-note]')) return ''
  if (!text.trim() || text.includes('\n') || charLength(text) > NOTE_ANCHOR_MAX) return ''
  if ([NOTE_OPEN, NOTE_CLOSE, NOTE_SEP].some((c) => text.includes(c))) return ''
  return text
}

// A quote's text as it reads once saved: the words a note explains underlined and the note a grey
// chip after them, like the analysis editor's tags. Words and note are one non-editable piece:
// Backspace after it takes the note off and leaves the words. The value is kept as plain text
// with the notes in the stored form, 「〔你｜王一生〕」.
export function QuoteBodyEditor({
  ref,
  initial,
  placeholder,
  onChange,
  onSelect,
}: {
  ref?: Ref<QuoteBodyEditorHandle>
  initial: string
  placeholder: string
  onChange: (body: string) => void
  onSelect?: (text: string) => void // the words selected in the editor ('' when none)
}) {
  const { t } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const range = useRef<Range | null>(null)
  const composing = useRef(false)

  const chip = (note: string, anchor?: string): HTMLSpanElement => {
    const el = document.createElement('span')
    el.contentEditable = 'false'
    el.dataset.note = note
    if (anchor) el.dataset.anchor = anchor
    el.className = 'cursor-default'
    const pill = document.createElement('span')
    pill.className = NOTE_CHIP
    pill.title = t(`${K}.noteTitle`)
    pill.textContent = note
    if (anchor) {
      const words = document.createElement('span')
      words.className = NOTE_ANCHOR
      words.textContent = anchor
      el.append(words)
    }
    el.append(pill)
    return el
  }

  const nodesFor = (text: string): Node[] => {
    const out: Node[] = []
    let at = 0
    for (const m of text.matchAll(NOTES)) {
      if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)))
      out.push(chip(m[2], m[1]))
      at = m.index + m[0].length
    }
    if (at < text.length) out.push(document.createTextNode(text.slice(at)))
    return out
  }

  // The editor's content as stored text.
  const serialize = (node: Node): string => {
    let out = ''
    node.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) out += (c.textContent ?? '').replaceAll(ZWSP, '')
      else if (c instanceof HTMLElement && c.dataset.note !== undefined)
        out += noteToken(c.dataset.note, c.dataset.anchor)
      else if (c instanceof HTMLBRElement) out += '\n'
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
    if (!text.trim() && el.childNodes.length && !el.querySelector('[data-note]'))
      el.replaceChildren()
    onChange(text)
  }

  // The caret after a chip goes into a text node, never onto the bare boundary next to it, where
  // an input method (pinyin…) can't start composing. An invisible character holds the place.
  const caretAt = (text: Text, offset: number) => {
    const r = document.createRange()
    r.setStart(text, offset)
    r.collapse(true)
    const sel = document.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
    range.current = r.cloneRange()
  }
  const placeCaretAfter = (node: Node) => {
    let next = node.nextSibling
    if (!(next instanceof Text)) {
      next = document.createTextNode(ZWSP)
      node.parentNode!.insertBefore(next, node.nextSibling)
    } else if (!next.data.startsWith(ZWSP)) next.insertData(0, ZWSP)
    caretAt(next as Text, 1)
  }

  // Puts nodes where the caret is (or was, before a button took the focus), or at the end, in
  // place of any selection.
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
    insertNote: (note) => {
      const r = range.current
      const words = r && root.current?.contains(r.commonAncestorContainer) ? notable(r) : ''
      if (words) insertNodes([chip(note, words)])
    },
    focus: () => root.current?.focus(),
  }))

  // Built once from the initial text; afterwards the DOM is the source of truth.
  useEffect(() => {
    const el = root.current
    if (!el) return
    el.replaceChildren(...nodesFor(initial))
    el.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Remember the selection while the editor has it, for the note button.
  useEffect(() => {
    const keep = () => {
      const sel = document.getSelection()
      if (!sel?.rangeCount || !root.current?.contains(sel.getRangeAt(0).commonAncestorContainer))
        return
      range.current = sel.getRangeAt(0).cloneRange()
      onSelect?.(sel.isCollapsed ? '' : notable(range.current))
    }
    document.addEventListener('selectionchange', keep)
    return () => document.removeEventListener('selectionchange', keep)
  }, [onSelect])

  // Turns a 〔note〕 just typed before the caret into a chip.
  const convert = () => {
    const sel = document.getSelection()
    if (!sel?.rangeCount || !sel.isCollapsed) return
    const { startContainer: node, startOffset: at } = sel.getRangeAt(0)
    if (node.nodeType !== Node.TEXT_NODE || !root.current?.contains(node)) return
    const text = node.textContent ?? ''
    const before = text.slice(0, at)
    const m = TYPED_NOTE.exec(before.replaceAll(ZWSP, ''))
    if (!m) return
    const start = before.lastIndexOf(NOTE_OPEN)
    const rest = document.createTextNode(ZWSP + text.slice(at))
    const made = chip(m[2], m[1])
    node.textContent = text.slice(0, start)
    node.parentNode!.insertBefore(rest, node.nextSibling)
    node.parentNode!.insertBefore(made, rest)
    caretAt(rest, 1)
  }

  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    // While an input method is composing (pinyin…), wait for the characters to be chosen.
    if (composing.current || (e.nativeEvent as InputEvent).isComposing) return
    convert()
    emit()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Backspace') {
      // Step back over the invisible placeholder, so Backspace reaches the piece in one press.
      const sel = document.getSelection()
      const r = sel?.rangeCount ? sel.getRangeAt(0) : null
      if (!r?.collapsed) return
      let before: Node | null = null // what sits right before the caret
      if (r.startContainer instanceof Text) {
        const t = r.startContainer
        let at = r.startOffset // read first: deleting moves the live range
        if (at > 0 && t.data[at - 1] === ZWSP) {
          t.deleteData(at - 1, 1)
          at -= 1
          caretAt(t, at)
        }
        if (at === 0) before = t.previousSibling
      } else before = r.startContainer.childNodes[r.startOffset - 1] ?? null
      // A note with words of its own comes off and leaves the words as plain text.
      if (before instanceof HTMLElement && before.dataset.anchor) {
        e.preventDefault()
        const words = document.createTextNode(before.dataset.anchor)
        before.replaceWith(words)
        caretAt(words, words.data.length)
        emit()
      }
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const el = root.current!
    const atEnd = (() => {
      const sel = document.getSelection()
      if (!sel?.rangeCount) return true
      const r = document.createRange()
      r.selectNodeContents(el)
      r.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset)
      return !r.toString().replaceAll(ZWSP, '') && !r.cloneContents().querySelector?.('[data-note]')
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
      className={
        'min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-[15px] leading-8 whitespace-pre-wrap outline-none ' +
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
        'empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]'
      }
    />
  )
}

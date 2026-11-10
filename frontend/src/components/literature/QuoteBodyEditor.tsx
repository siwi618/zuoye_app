import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { NOTE_CHIP, NOTE_CLOSE, NOTE_OPEN } from '@/lib/literature/text'

const K = 'tools.literature'

export interface QuoteBodyEditorHandle {
  // Puts a note right after the words selected last (or at the caret, or at the end).
  insertNote: (note: string) => void
  focus: () => void
}

// 「〔王一生〕」 just typed (or its closing 〕): becomes a chip.
const TYPED_NOTE = new RegExp(`${NOTE_OPEN}([^${NOTE_OPEN}${NOTE_CLOSE}\\n]{1,40})${NOTE_CLOSE}$`)
const NOTES = new RegExp(`${NOTE_OPEN}([^${NOTE_OPEN}${NOTE_CLOSE}\\n]{1,40})${NOTE_CLOSE}`, 'g')
const ZWSP = '​' // keeps a caret line after a chip or a trailing line break; never saved

// A quote's text as it reads once saved: its 〔notes〕 as grey chips, like the analysis editor's
// tags. A chip is a single, non-editable piece, so Backspace removes one whole. The value is kept
// as plain text with the notes in 〔〕, the stored format.
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

  const chip = (note: string): HTMLSpanElement => {
    const el = document.createElement('span')
    el.contentEditable = 'false'
    el.dataset.note = note
    el.className = NOTE_CHIP
    el.title = t(`${K}.noteTitle`)
    el.textContent = note
    return el
  }

  const nodesFor = (text: string): Node[] => {
    const out: Node[] = []
    let at = 0
    for (const m of text.matchAll(NOTES)) {
      if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)))
      out.push(chip(m[1]))
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
        out += NOTE_OPEN + c.dataset.note + NOTE_CLOSE
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

  // Puts nodes where the caret is (or was, before a button took the focus), or at the end. With
  // `after`, a selection stays and the nodes go right after it (a note follows its words).
  const insertNodes = (nodes: Node[], after = false) => {
    const el = root.current
    if (!el || !nodes.length) return
    el.focus()
    let r = range.current
    if (!r || !el.contains(r.commonAncestorContainer)) {
      r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(false)
    }
    if (after) r.collapse(false)
    else r.deleteContents()
    const frag = document.createDocumentFragment()
    nodes.forEach((n) => frag.append(n))
    const last = nodes[nodes.length - 1]
    r.insertNode(frag)
    placeCaretAfter(last)
    emit()
  }

  useImperativeHandle(ref, () => ({
    insertNote: (note) => insertNodes([chip(note)], true),
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
      onSelect?.(sel.isCollapsed ? '' : sel.toString().replaceAll(ZWSP, '').trim())
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
    const made = chip(m[1])
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
      // Step back over the invisible placeholder, so Backspace removes the chip in one press.
      const sel = document.getSelection()
      const r = sel?.rangeCount ? sel.getRangeAt(0) : null
      if (r?.collapsed && r.startContainer instanceof Text && r.startOffset > 0) {
        const t = r.startContainer
        const at = r.startOffset // read first: deleting moves the live range
        if (t.data[at - 1] === ZWSP) {
          t.deleteData(at - 1, 1)
          caretAt(t, at - 1)
        }
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

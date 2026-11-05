import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Maximize2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { WORKS } from '@/lib/literature/corpus'
import type { CoreDevice, Selection } from './DysonScene'

const K = 'tools.literature'

interface Item extends Selection {
  label: string
  meta?: string
  text: string // what the query is matched against
}

// A group's heading row, opening the side panel's list of all devices or all works.
interface Heading {
  home: Selection['kind']
  title: string
  count: number // all of the group, whatever the query
}
type Row = Item | Heading

const same = (a: Selection | null, b: Selection) => a?.kind === b.kind && a?.key === b.key

// One line however many devices and works there are: a search box whose list has two groups,
// devices and works (each work with its author and year). Picking a row selects it and turns the
// sphere to it; the zoom button on a row (or next to the current selection) opens its local graph.
// Picking a group's heading opens the list of that group in the side panel.
export function SceneSearch({
  devices,
  selected,
  zoomed,
  onChoose,
  onClear,
  onHome,
}: {
  devices: CoreDevice[]
  selected: Selection | null
  zoomed: boolean
  onChoose: (s: Selection, zoomIn: boolean) => void
  onClear: () => void
  onHome: (kind: Selection['kind']) => void
}) {
  const { t } = useTranslation()
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const groups = useMemo<{ kind: Selection['kind']; title: string; items: Item[] }[]>(
    () => [
      {
        kind: 'device',
        title: t(`${K}.kindDevice`),
        items: devices.map((d) => ({ kind: 'device', key: d.key, label: d.label, text: d.label })),
      },
      {
        kind: 'work',
        title: t(`${K}.kindWork`),
        items: WORKS.map((w) => ({
          kind: 'work',
          key: w.key,
          label: `《${w.title}》`,
          meta: `${w.author} · ${w.year}`,
          text: [w.title, w.author, w.group ?? ''].join(' '),
        })),
      },
    ],
    [t, devices],
  )

  const q = query.trim().toLowerCase()
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !q || i.text.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0)
  const headings = new Map<string, Heading>(
    groups.map((g) => [g.kind, { home: g.kind, title: g.title, count: g.items.length }]),
  )
  const flat: Row[] = shown.flatMap((g) => [headings.get(g.kind)!, ...g.items])
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  const current = selected && groups.flatMap((g) => g.items).find((i) => same(selected, i))
  const at = Math.min(active, flat.length - 1)

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }
  const choose = (row: Row, zoomIn: boolean) => {
    if ('home' in row) onHome(row.home)
    else onChoose({ kind: row.kind, key: row.key }, zoomIn)
    close()
    input.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      const n = flat.length
      if (n) setActive((at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
    } else if (e.key === 'Enter' && open && flat[at]) {
      e.preventDefault()
      // Shift+Enter zooms in, like the row's zoom button.
      choose(flat[at], e.shiftKey)
    } else if (e.key === 'Escape' && open) {
      // Only close the list; the page's Esc (leave the local graph) waits for the next press.
      e.stopPropagation()
      close()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 basis-56">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={input}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && flat[at] ? `${listId}-${at}` : undefined}
          aria-label={t(`${K}.searchLabel`)}
          value={query}
          placeholder={t(`${K}.searchPlaceholder`, { count: total })}
          onChange={(e) => {
            setQuery(e.target.value)
            // While typing, Enter goes to the first match rather than its group's heading.
            setActive(e.target.value.trim() ? 1 : 0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-full border border-border bg-background pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
        />
        {open && (
          <div
            id={listId}
            role="listbox"
            aria-label={t(`${K}.searchLabel`)}
            // Keep the focus in the box while a row is pressed, so blur does not close the list
            // before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-soft-lg"
          >
            {shown.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {t(`${K}.searchEmpty`, { query: query.trim() })}
              </p>
            )}
            {shown.map((g) => {
              const heading = headings.get(g.kind)!
              const h = flat.indexOf(heading)
              return (
                <div key={g.kind} role="group" aria-label={g.title}>
                  <div
                    id={`${listId}-${h}`}
                    role="option"
                    aria-selected={h === at}
                    onMouseEnter={() => setActive(h)}
                    onClick={() => choose(heading, false)}
                    className={cn(
                      'mt-1 flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-primary',
                      h === at && 'bg-secondary',
                    )}
                  >
                    {g.title}
                    <span className="ml-auto font-normal text-muted-foreground">
                      {t(`${K}.seeAllCount`, { count: heading.count })}
                    </span>
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </div>
                  {g.items.map((item) => {
                    const i = flat.indexOf(item)
                    const on = same(selected, item)
                    return (
                      <div
                        key={item.key}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === at}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(item, false)}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-1.5 pl-3 text-sm',
                          i === at && 'bg-secondary',
                        )}
                      >
                        <span className={cn('truncate', on && 'font-semibold text-primary')}>
                          {item.label}
                        </span>
                        {item.meta && (
                          <span className="text-xs text-muted-foreground">{item.meta}</span>
                        )}
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={t(`${K}.zoomInto`, { name: item.label })}
                          title={t(`${K}.zoomInto`, { name: item.label })}
                          onClick={(e) => {
                            e.stopPropagation()
                            choose(item, true)
                          }}
                          className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-primary"
                        >
                          <Maximize2 className="size-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <p className="border-t border-border/70 px-3 pt-2 pb-1 text-xs text-muted-foreground">
              {t(`${K}.searchKeys`)}
            </p>
          </div>
        )}
      </div>

      {current && (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-9 min-w-0 items-center gap-1 rounded-full border border-primary bg-primary pr-1 pl-3 text-sm text-primary-foreground">
            <span className="truncate">{current.label}</span>
            <button
              type="button"
              aria-label={t(`${K}.clearSelection`)}
              title={t(`${K}.clearSelection`)}
              onClick={onClear}
              className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-primary-foreground/15"
            >
              <X className="size-3.5" />
            </button>
          </span>
          {!zoomed && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full"
              onClick={() => onChoose({ kind: current.kind, key: current.key }, true)}
            >
              <Maximize2 className="size-4" />
              {t(`${K}.zoomIn`)}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

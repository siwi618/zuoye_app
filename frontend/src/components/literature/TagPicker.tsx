import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Hash, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchTags } from '@/api/literature'
import { cleanTag, isValidTag } from '@/lib/literature/text'

const K = 'tools.literature'
const MAX_TAGS = 8

// #device tags for an analysis, like hashtags: pick one other students already use (most used
// first) or create a new one by typing it.
export function TagPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const { t } = useTranslation()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const name = cleanTag(query)
  const found = useQuery({
    queryKey: ['literature-tags', name.toLowerCase()],
    queryFn: () => searchTags(name),
    staleTime: 30_000,
    enabled: open,
  })

  const has = (n: string) => value.some((v) => v.toLowerCase() === n.toLowerCase())
  const options = (found.data ?? []).filter((tag) => !has(tag.name)).slice(0, 8)
  const exact = (found.data ?? []).some((tag) => tag.name.toLowerCase() === name.toLowerCase())
  const canCreate = isValidTag(name) && !exact && !has(name)
  const rows = [
    ...options.map((tag) => ({ name: tag.name, count: tag.count as number | null })),
    ...(canCreate ? [{ name, count: null }] : []),
  ]
  const full = value.length >= MAX_TAGS
  const at = Math.min(active, rows.length - 1)

  const add = (n: string) => {
    if (full || has(n) || !isValidTag(n)) return
    onChange([...value, n])
    setQuery('')
    setActive(0)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length) setActive((at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[at]) add(rows[at].name)
      else if (isValidTag(name)) add(name)
    } else if (e.key === 'Backspace' && !query && value.length) {
      onChange(value.slice(0, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-sm font-medium text-primary"
            >
              #{tag}
              <button
                type="button"
                aria-label={t(`${K}.removeTag`, { name: tag })}
                onClick={() => onChange(value.filter((v) => v !== tag))}
                className="grid size-5 place-items-center rounded-full hover:bg-primary/15"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {!full && (
            <input
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-label={t(`${K}.tagPlaceholder`)}
              value={query}
              placeholder={value.length ? '' : t(`${K}.tagPlaceholder`)}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onKeyDown}
              className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          )}
        </div>
        {open && rows.length > 0 && (
          <div
            id={listId}
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-soft-lg"
          >
            {rows.map((row, i) => (
              <div
                key={`${row.name}-${row.count ?? 'new'}`}
                role="option"
                aria-selected={i === at}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(row.name)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                  i === at && 'bg-secondary',
                )}
              >
                {row.count === null ? (
                  <>
                    <Plus className="size-3.5 text-primary" />
                    <span>{t(`${K}.createTag`, { name: row.name })}</span>
                  </>
                ) : (
                  <>
                    <Hash className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t(`${K}.analysisCount`, { count: row.count })}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {name && !isValidTag(name) && (
        <p className="text-xs text-destructive">{t(`${K}.tagInvalid`)}</p>
      )}
      {full && (
        <p className="text-xs text-muted-foreground">{t(`${K}.maxTags`, { count: MAX_TAGS })}</p>
      )}
    </div>
  )
}

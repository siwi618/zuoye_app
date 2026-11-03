import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, PenLine } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { DEVICES, ENTRIES, WORKS, entryKey } from '@/lib/literature/corpus'
import type { Selection } from './DysonScene'

const K = 'tools.literature'

interface NotesProps {
  notes: Record<string, string>
  setNote: (key: string, text: string) => void
}

// The student's own addition under a preset analysis; collapsed until used.
function MyNote({ noteKey, notes, setNote }: NotesProps & { noteKey: string }) {
  const { t } = useTranslation()
  const value = notes[noteKey] ?? ''
  const [open, setOpen] = useState(false)
  if (!open && !value) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <PenLine className="size-3.5" />
        {t(`${K}.addNote`)}
      </button>
    )
  }
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{t(`${K}.myNote`)}</span>
      <Textarea
        autoFocus={open && !value}
        value={value}
        onChange={(e) => setNote(noteKey, e.target.value)}
        onBlur={() => !value && setOpen(false)}
        placeholder={t(`${K}.notePlaceholder`)}
      />
    </label>
  )
}

export function DetailPanel({
  selected,
  onSelect,
  notes,
  setNote,
}: { selected: Selection | null; onSelect: (s: Selection) => void } & NotesProps) {
  const { t } = useTranslation()

  // Nothing selected: what the map holds, each entry a way in.
  if (!selected) {
    return (
      <div className="space-y-5">
        <header className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{t(`${K}.overview`)}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t(`${K}.overviewHint`)}</p>
        </header>
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-primary">{t(`${K}.kindDevice`)}</h3>
          {DEVICES.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => onSelect({ kind: 'device', key: d.key })}
              className="group block w-full rounded-xl border border-border/70 p-3 text-left hover:border-primary/60"
            >
              <div className="font-semibold group-hover:text-primary">{d.name}</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{d.question}</div>
            </button>
          ))}
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-primary">{t(`${K}.kindWork`)}</h3>
          {WORKS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => onSelect({ kind: 'work', key: w.key })}
              className="group flex w-full items-baseline gap-2 rounded-xl border border-border/70 p-3 text-left hover:border-primary/60"
            >
              <span className="font-semibold group-hover:text-primary">《{w.title}》</span>
              <span className="text-sm text-muted-foreground">
                {w.author} · {w.year}
              </span>
            </button>
          ))}
        </section>
      </div>
    )
  }

  if (selected.kind === 'device') {
    const d = DEVICES.find((x) => x.key === selected.key)!
    const works = WORKS.filter((w) => ENTRIES[entryKey(w.key, d.key)])
    return (
      <div className="space-y-5">
        <header className="space-y-2">
          <div className="text-xs font-medium text-primary">{t(`${K}.kindDevice`)}</div>
          <h2 className="text-2xl font-bold tracking-tight">{d.name}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{d.question}</p>
        </header>
        <section className="space-y-1.5 rounded-xl bg-primary/8 p-4">
          <h3 className="text-sm font-medium">{t(`${K}.synthesis`)}</h3>
          <p className="text-sm leading-7">{d.synthesis}</p>
        </section>
        {works.map((w) => {
          const key = entryKey(w.key, d.key)
          return (
            <article key={w.key} className="space-y-3 border-t border-border/70 pt-4">
              <button
                type="button"
                onClick={() => onSelect({ kind: 'work', key: w.key })}
                className="group flex w-full items-baseline gap-2 text-left"
              >
                <span className="font-semibold group-hover:text-primary">《{w.title}》</span>
                <span className="text-sm text-muted-foreground">
                  {w.author} · {w.year}
                </span>
                <ChevronRight className="ml-auto size-4 self-center text-muted-foreground" />
              </button>
              <p className="text-sm leading-7">{ENTRIES[key]}</p>
              <MyNote noteKey={key} notes={notes} setNote={setNote} />
            </article>
          )
        })}
      </div>
    )
  }

  const w = WORKS.find((x) => x.key === selected.key)!
  const devices = DEVICES.filter((d) => ENTRIES[entryKey(w.key, d.key)])
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="text-xs font-medium text-primary">
          {t(`${K}.kindWork`)}
          {w.group && ` · ${t(`${K}.group`, { name: w.group })}`}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">《{w.title}》</h2>
        <p className="text-sm text-muted-foreground">
          {w.author} · {w.year}
        </p>
        <p className="text-sm leading-6">{w.blurb}</p>
      </header>
      {devices.map((d) => {
        const key = entryKey(w.key, d.key)
        return (
          <article key={d.key} className="space-y-3 border-t border-border/70 pt-4">
            <button
              type="button"
              onClick={() => onSelect({ kind: 'device', key: d.key })}
              className="group flex w-full items-center gap-2 text-left"
            >
              <span className="font-semibold group-hover:text-primary">{d.name}</span>
              <span className="ml-auto text-xs text-muted-foreground group-hover:text-primary">
                {t(`${K}.compare`)}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
            <p className="text-sm leading-7">{ENTRIES[key]}</p>
            <MyNote noteKey={key} notes={notes} setNote={setNote} />
          </article>
        )
      })}
    </div>
  )
}

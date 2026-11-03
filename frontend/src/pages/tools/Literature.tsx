import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { DEVICES } from '@/lib/literature/corpus'
import { useNotes } from '@/lib/literature/notes'
import { DysonScene, type Focus, type Selection } from '@/components/literature/DysonScene'
import { DetailPanel } from '@/components/literature/DetailPanel'
import { SceneSearch } from '@/components/literature/SceneSearch'

const K = 'tools.literature'

// Cross-text comparison: literary devices sit on the core sphere, works on the outer shell, and
// each link is one work's use of one device. Picking a device lines the works up side by side.
export function Literature() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Selection | null>({
    kind: 'device',
    key: DEVICES[0].key,
  })
  const [focus, setFocus] = useState<Focus | null>(null)
  // The node the scene has zoomed into (its local graph), or null for the whole sphere.
  const [zoom, setZoom] = useState<Selection | null>(null)
  const { notes, setNote } = useNotes()

  // Clearing the selection also leaves the zoom, a moment later: the first click of a double
  // click on the selected node clears it, and the second must be able to cancel that.
  const leaveTimer = useRef(0)
  const stay = () => window.clearTimeout(leaveTimer.current)
  useEffect(() => stay, [])

  // Spheres in the scene: one click selects, a click on the selected one clears it, a double
  // click selects it, turns the scene so it faces the viewer and zooms into its local graph.
  // In the local graph a single click on a surrounding node already makes it the centre.
  // `clicks` is the event's detail: the second click of a double click arrives with 2, so it never
  // undoes the first (keyboard activation arrives with 0 and simply toggles).
  // Setting the same centre again would restart the scene's zoom effect and cut short a centre
  // move still running (the second click of a double click on a surrounding node).
  const zoomTo = (s: Selection) => setZoom((z) => (z?.kind === s.kind && z?.key === s.key ? z : s))

  const pick = (s: Selection, clicks: number) => {
    stay()
    const isCentre = zoom?.kind === s.kind && zoom?.key === s.key
    if (clicks >= 2 || (zoom && !isCentre)) {
      setSelected(s)
      setFocus((f) => ({ ...s, nonce: (f?.nonce ?? 0) + 1 }))
      zoomTo(s)
      return
    }
    const on = selected?.kind === s.kind && selected?.key === s.key
    setSelected(on ? null : s)
    if (on && zoom) leaveTimer.current = window.setTimeout(() => setZoom(null), 280)
  }

  // Back to the whole sphere, with nothing selected (Esc or the Back button).
  const leave = () => {
    stay()
    setZoom(null)
    setSelected(null)
  }
  useEffect(() => {
    if (!zoom) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      stay()
      setZoom(null)
      setSelected(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [zoom])

  // From the search box: select and turn the sphere to it; `zoomIn` also opens its local graph.
  // Already in a local graph, the choice becomes the new centre.
  const choose = (s: Selection, zoomIn: boolean) => {
    stay()
    setSelected(s)
    setFocus((f) => ({ ...s, nonce: (f?.nonce ?? 0) + 1 }))
    if (zoomIn || zoom) zoomTo(s)
  }
  const clear = () => (zoom ? leave() : setSelected(null))

  return (
    <div className="space-y-6">
      <Link
        to="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('tools.title')}
      </Link>
      <header className="flex items-center gap-4">
        <img src="/tools/literature.svg" alt="" className="size-14 shrink-0" />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('tools.items.literature')}</h1>
          <p className="text-muted-foreground">{t(`${K}.subtitle`)}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b border-border/70 px-4 py-3">
            <SceneSearch
              selected={selected}
              zoomed={zoom !== null}
              onChoose={choose}
              onClear={clear}
            />
          </div>
          <div className="relative aspect-square max-h-[620px] w-full sm:aspect-[6/5]">
            <DysonScene selected={selected} onPick={pick} focus={focus} zoom={zoom} />
            <p
              className={cn(
                'pointer-events-none absolute top-3 left-4 text-xs text-muted-foreground',
                zoom && 'right-32',
              )}
            >
              {t(zoom ? `${K}.zoomHint` : `${K}.hint`)}
            </p>
            {zoom && (
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-3 bg-card"
                onClick={leave}
              >
                <Minimize2 className="size-4" />
                {t(`${K}.zoomOut`)}
              </Button>
            )}
          </div>
        </Card>

        <Card className="py-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
          <div className="p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <DetailPanel
              key={selected ? `${selected.kind}:${selected.key}` : 'overview'}
              selected={selected}
              onSelect={setSelected}
              notes={notes}
              setNote={setNote}
            />
            <p className="mt-6 text-xs text-muted-foreground">{t(`${K}.savedLocally`)}</p>
          </div>
        </Card>
      </div>
    </div>
  )
}

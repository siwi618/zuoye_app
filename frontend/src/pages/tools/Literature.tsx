import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getOverview, type TagRead } from '@/api/literature'
import {
  DysonScene,
  type CoreDevice,
  type Focus,
  type Link as SceneLink,
  type Selection,
} from '@/components/literature/DysonScene'
import { DetailPanel } from '@/components/literature/DetailPanel'
import { SceneSearch } from '@/components/literature/SceneSearch'

const K = 'tools.literature'

// Cross-text comparison: the #device tags students use most sit on the core sphere, works on the
// outer shell, and each link is a work whose analyses use that tag. A work's quotes and analyses
// live on its own page (WorkPage).
export function Literature() {
  const { t } = useTranslation()
  const [selected, setSelectedState] = useState<Selection | null>(null)
  // The side panel's list page of all devices or all works; any selection replaces it.
  const [home, setHome] = useState<Selection['kind'] | null>(null)
  // Devices opened from the panel's search that aren't on the sphere's core.
  const [knownTags, setKnownTags] = useState<TagRead[]>([])
  const setSelected = (s: Selection | null) => {
    setHome(null)
    setSelectedState(s)
  }
  const [focus, setFocus] = useState<Focus | null>(null)
  // The node the scene has zoomed into (its local graph), or null for the whole sphere.
  const [zoom, setZoom] = useState<Selection | null>(null)
  const overview = useQuery({ queryKey: ['literature-overview'], queryFn: getOverview })
  const devices = useMemo<CoreDevice[]>(
    () => (overview.data?.tags ?? []).map((t) => ({ key: t.id, label: `#${t.name}` })),
    [overview.data],
  )
  const links = useMemo<SceneLink[]>(
    () => (overview.data?.links ?? []).map((l) => ({ work: l.work_key, device: l.tag_id })),
    [overview.data],
  )

  // Spheres in the scene: one click opens that node's local graph (selects it, turns it to face the
  // viewer and zooms in). In the local graph a click on a surrounding node makes it the centre, and
  // a click on the centre goes back to the whole sphere. `clicks` is the event's detail: the second
  // click of a double click arrives with 2 and is ignored, or it would land on the node that has
  // just become the centre and leave again (keyboard activation arrives with 0).
  // Setting the same centre again would restart the scene's zoom effect and cut short a centre
  // move still running.
  const zoomTo = (s: Selection) => setZoom((z) => (z?.kind === s.kind && z?.key === s.key ? z : s))

  const pick = (s: Selection, clicks: number) => {
    if (clicks >= 2) return
    if (zoom?.kind === s.kind && zoom?.key === s.key) {
      leave()
      return
    }
    setSelected(s)
    setFocus((f) => ({ ...s, nonce: (f?.nonce ?? 0) + 1 }))
    zoomTo(s)
  }

  // Back to the whole sphere, with nothing selected (Esc or the Back button).
  const leave = () => {
    setZoom(null)
    setSelected(null)
  }
  useEffect(() => {
    if (!zoom) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setZoom(null)
      setSelected(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [zoom])

  // From the search box: select and turn the sphere to it; `zoomIn` also opens its local graph.
  // Already in a local graph, the choice becomes the new centre.
  const choose = (s: Selection, zoomIn: boolean) => {
    setSelected(s)
    setFocus((f) => ({ ...s, nonce: (f?.nonce ?? 0) + 1 }))
    if (zoomIn || zoom) zoomTo(s)
  }
  const clear = () => (zoom ? leave() : setSelected(null))
  // From the search box's group headings or the panel: the list page of that kind.
  const openHome = (kind: Selection['kind']) => {
    setZoom(null)
    setSelectedState(null)
    setHome(kind)
  }

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
              devices={devices}
              selected={selected}
              zoomed={zoom !== null}
              onChoose={choose}
              onClear={clear}
              onHome={openHome}
            />
          </div>
          <div className="relative aspect-square max-h-[620px] w-full sm:aspect-[6/5]">
            <DysonScene
              devices={devices}
              links={links}
              selected={selected}
              onPick={pick}
              focus={focus}
              zoom={zoom}
            />
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
              key={selected ? `${selected.kind}:${selected.key}` : (home ?? 'overview')}
              selected={selected}
              home={home}
              overview={overview.data}
              knownTags={knownTags}
              onKnowTag={(tag) =>
                setKnownTags((ks) => (ks.some((k) => k.id === tag.id) ? ks : [...ks, tag]))
              }
              onSelect={setSelected}
              onHome={openHome}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Link2, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  GUIDE_EVENTS_KEY,
  deleteGuideEvent,
  guideEventKey,
  updateGuideEvent,
  useGuideEvent,
  type GuideEvent as GuideEventData,
  type GuideEventConfig,
} from '@/api/guide'
import {
  createGuideScene,
  type FloorMode,
  type GuideGroup,
  type GuideHooks,
  type GuideScene,
  type LabelMode,
} from '@/lib/guide/scene'
import { ENTRIES, PALETTE, PLACES, PLAN } from '@/lib/guide/plan'
import '@/lib/guide/guide.css'

interface Draft {
  title: string
  subtitle: string
  config: GuideEventConfig
  open_from: string | null
  open_to: string | null
}

const toDraft = (ev: GuideEventData): Draft => ({
  title: ev.title,
  subtitle: ev.subtitle,
  config: {
    start: ev.config.start ?? null,
    sign: ev.config.sign ?? '',
    activities: ev.config.activities ?? [],
    labels: ev.config.labels ?? {},
  },
  open_from: ev.open_from,
  open_to: ev.open_to,
})

const FLOOR_BUTTONS: { mode: FloorMode; label?: string }[] = [
  { mode: 'auto' },
  { mode: 'all' },
  { mode: 3, label: '3F' },
  { mode: 2, label: '2F' },
  { mode: 1, label: '1F' },
]

// Label density, under the floors: every room name (as before), only the activities, or none.
const LABEL_MODES: LabelMode[] = ['all', 'acts', 'none']

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// One event's 3D map: anyone signed in sees it by the link; the student council president and vice
// president, and the event's collaborators, can edit it in the side panel (changes show on the map
// at once and are kept with 「保存」). Only the president and vice may delete it or choose its
// collaborators.
export function GuideEvent() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const event = useGuideEvent(id)
  const canEdit = !!event.data?.can_edit
  const manager = !!event.data?.can_manage

  // Edits pending save; null = none, and the page shows the server's copy.
  const [edits, setEdits] = useState<Draft | null>(null)
  const server = useMemo(() => (event.data ? toDraft(event.data) : null), [event.data])
  const draft = edits ?? server
  const dirty = edits !== null
  const editing = canEdit && params.get('edit') === '1'
  const [groups, setGroups] = useState<GuideGroup[]>([])
  const [floorMode, setFloorModeState] = useState<FloorMode>('auto')
  const [labelMode, setLabelMode] = useState<LabelMode>('all')
  const [exportOpen, setExportOpen] = useState(false)
  const [listOpen, setListOpen] = useState(true)
  const [pickRequested, setPicking] = useState(false)
  const picking = pickRequested && editing
  const [narrow, setNarrow] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const floorsRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<GuideScene | null>(null)
  const lastAutoName = useRef('')

  const change = useCallback(
    (fn: (d: Draft) => Draft) => setEdits((e) => (e ?? server ? fn((e ?? server) as Draft) : e)),
    [server],
  )

  // Room clicks and picks arrive from the scene; this keeps it calling the latest handlers.
  const handlers = useRef<{
    roomClick: NonNullable<GuideHooks['onRoomClick']>
    pickStart: NonNullable<GuideHooks['onPickStart']>
    labelMove: NonNullable<GuideHooks['onLabelMove']>
  }>({ roomClick: () => {}, pickStart: () => {}, labelMove: () => {} })
  useLayoutEffect(() => {
    // A label dragged while editing goes into the draft (saved with the event); positions left over
    // from rooms no longer used are dropped on the way.
    handlers.current.labelMove = (key, offset) =>
      change((d) => {
        const used = new Set(['@start', '@sign', ...d.config.activities.map((a) => a.place)])
        const labels = Object.fromEntries(
          Object.entries(d.config.labels ?? {}).filter(([k]) => k !== key && used.has(k)),
        )
        if (offset) labels[key] = offset
        return { ...d, config: { ...d.config, labels } }
      })
    handlers.current.roomClick = (room) => {
      if (room.editing) {
        if (!room.selectable) return void toast(t('tools.guide.notSelectable', { name: room.name }))
        change((d) => ({
          ...d,
          config: {
            ...d.config,
            activities: [...d.config.activities, { place: room.name, name: '', time: '' }],
          },
        }))
        requestAnimationFrame(() => {
          const inputs = panelRef.current?.querySelectorAll<HTMLInputElement>('[data-act-name]')
          inputs?.[inputs.length - 1]?.focus()
        })
        return
      }
      const floor = PLAN[room.floor].tag
      toast(
        t('tools.guide.roomInfo', { floor, name: room.name }) +
          (room.activities.length ? ' — ' + room.activities.join('、') : ''),
      )
    }
    handlers.current.pickStart = ({ floor, pos, autoName }) => {
      setPicking(false)
      const s = draft?.config.start
      const old = s && typeof s === 'object' ? s.name : ''
      // An empty name, or one picked automatically last time, follows the spot; a typed one stays.
      const name = !old || old === lastAutoName.current ? autoName : old
      if (name === autoName) lastAutoName.current = autoName
      change((d) => ({ ...d, config: { ...d.config, start: { name, floor, pos } } }))
      toast(t('tools.guide.startSet', { floor: PLAN[floor].tag, name }))
    }
  })

  // The scene lives as long as the page; it reads the panels' sizes to keep the map clear of them.
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const scene = createGuideScene(stage, {
      insets: () => {
        const s = stage.getBoundingClientRect()
        const title = titleRef.current?.getBoundingClientRect()
        const floors = floorsRef.current?.getBoundingClientRect()
        const panel = panelRef.current?.getBoundingClientRect()
        const wide = s.width > 720
        return {
          top: title ? title.bottom - s.top + 44 : 24,
          left: wide && floors ? floors.right - s.left + 24 : 16,
          right: wide && panel && panel.width ? s.right - panel.left + 24 : wide ? 24 : 64,
          bottom: 24,
        }
      },
      onChange: (g) => setGroups(g),
      onFloorMode: (m) => setFloorModeState(m),
      onRoomClick: (room) => handlers.current.roomClick(room),
      onPickStart: (pick) => handlers.current.pickStart(pick),
      onPickMiss: () => toast(t('tools.guide.pickMiss')),
      onLabelMove: (key, offset) => handlers.current.labelMove(key, offset),
    })
    sceneRef.current = scene
    const ro = new ResizeObserver(() => setNarrow(stage.clientWidth <= 720))
    ro.observe(stage)
    return () => {
      ro.disconnect()
      scene.dispose()
      sceneRef.current = null
    }
    // The stage is only unmounted for the "not found" message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.isError])

  useEffect(() => {
    if (!draft) return
    sceneRef.current?.setConfig({ title: draft.title, subtitle: draft.subtitle, ...draft.config })
  }, [draft])

  useEffect(() => {
    sceneRef.current?.setEditMode(editing)
  }, [editing])

  useEffect(() => {
    sceneRef.current?.setLabelMode(labelMode)
  }, [labelMode])

  useEffect(() => {
    sceneRef.current?.setPicking(picking)
    if (picking) toast(t('tools.guide.pickPrompt'))
  }, [picking, t])

  // Panels opening or closing change how much of the stage the map may use.
  useEffect(() => {
    const id = setTimeout(() => sceneRef.current?.refit(), 60)
    return () => clearTimeout(id)
  }, [editing, listOpen, narrow])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useMutation({
    // A custom start whose spot was never picked is saved as no start (the map draws no route).
    mutationFn: (d: Draft) => {
      const s = d.config.start
      const start = s && typeof s === 'object' && !s.floor ? null : s
      return updateGuideEvent(id, { ...d, config: { ...d.config, start } })
    },
    onSuccess: (ev) => {
      queryClient.setQueryData(guideEventKey(id), ev)
      void queryClient.invalidateQueries({ queryKey: GUIDE_EVENTS_KEY })
      setEdits(null)
      toast.success(t('tools.guide.saved'))
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: () => deleteGuideEvent(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GUIDE_EVENTS_KEY })
      setEdits(null)
      toast.success(t('tools.guide.deleted'))
      navigate('/tools/guide')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const setEditing = (on: boolean) => {
    const next = new URLSearchParams(params)
    if (on) next.set('edit', '1')
    else next.delete('edit')
    setParams(next, { replace: true })
  }

  const flat = useMemo(
    () =>
      groups
        .flatMap((g) => g.acts.map((a) => ({ ...a, place: g.place, floor: g.floor })))
        .sort((a, b) => a.i - b.i),
    [groups],
  )

  const runExport = async (kind: 'phone' | 'a4' | 'screen') => {
    setExportOpen(false)
    const blob = await sceneRef.current?.exportImage(kind)
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${draft?.title || t('tools.guide.title')}-${t(`tools.guide.exportName.${kind}`)}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    toast.success(t('tools.guide.exported'))
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${location.origin}/tools/guide/${id}`)
    toast.success(t('tools.guide.linkCopied'))
  }

  if (event.isError)
    return (
      <div className="space-y-4">
        <BackLink council={false} />
        <p className="text-muted-foreground">{t('tools.guide.notFound')}</p>
      </div>
    )

  const start = draft?.config.start
  const custom = !!start && typeof start === 'object'

  const listPanel = (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 pt-1 text-sm font-semibold text-muted-foreground">
        <span>{t('tools.guide.activities', { count: flat.length })}</span>
        {narrow ? null : (
          <button
            className="text-xs font-normal hover:text-foreground"
            onClick={() => setListOpen((o) => !o)}
          >
            {listOpen ? t('tools.guide.collapse') : t('tools.guide.expand')}
          </button>
        )}
      </div>
      {(listOpen || narrow) &&
        (flat.length ? (
          flat.map((a) => (
            <button
              key={a.i}
              className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-muted"
              onClick={() => sceneRef.current?.focusRoom(a.place)}
            >
              <span className="gd-badge mt-0.5" style={{ background: a.color }}>
                {a.i}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[PLAN[a.floor].tag, a.place, a.time].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))
        ) : (
          <p className="px-2 pb-2 text-xs text-muted-foreground">
            {canEdit ? t('tools.guide.noActivitiesPlanner') : t('tools.guide.noActivities')}
          </p>
        ))}
    </div>
  )

  const editor = draft && (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('tools.guide.edit')}</h2>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X className="size-4" />
          {t('tools.guide.done')}
        </Button>
      </div>
      <Field label={t('tools.guide.fields.title')}>
        <Input
          value={draft.title}
          maxLength={60}
          onChange={(e) => change((d) => ({ ...d, title: e.target.value }))}
        />
      </Field>
      <Field label={t('tools.guide.fields.subtitle')}>
        <Input
          value={draft.subtitle}
          maxLength={80}
          onChange={(e) => change((d) => ({ ...d, subtitle: e.target.value }))}
        />
      </Field>
      <Field label={t('tools.guide.fields.open')}>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={draft.open_from ?? ''}
            aria-label={t('tools.guide.fields.openFrom')}
            onChange={(e) => {
              const from = e.target.value || null
              change((d) => ({
                ...d,
                open_from: from,
                open_to: !from ? null : !d.open_to || d.open_to < from ? from : d.open_to,
              }))
            }}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={draft.open_to ?? ''}
            min={draft.open_from ?? undefined}
            aria-label={t('tools.guide.fields.openTo')}
            onChange={(e) => {
              const to = e.target.value || null
              change((d) => ({
                ...d,
                open_to: to,
                open_from: !to ? null : !d.open_from || d.open_from > to ? to : d.open_from,
              }))
            }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {draft.open_from ? t('tools.guide.fields.openHint') : t('tools.guide.fields.notOpenHint')}
        </p>
      </Field>
      <Field label={t('tools.guide.fields.start')}>
        <select
          className={selectClass}
          value={custom ? '__custom' : (start as string | null) || ''}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__custom') {
              if (!custom)
                change((d) => ({ ...d, config: { ...d.config, start: { name: '', floor: 0, pos: [0, 0] } } }))
              setPicking(true)
            } else {
              setPicking(false)
              change((d) => ({ ...d, config: { ...d.config, start: v || null } }))
            }
          }}
        >
          <option value="">{t('tools.guide.noRoute')}</option>
          <optgroup label={t('tools.guide.entrances')}>
            {Object.entries(ENTRIES).map(([k, e]) => (
              <option key={k} value={k}>
                {e.label}
              </option>
            ))}
          </optgroup>
          <option value="__custom">{t('tools.guide.custom')}</option>
        </select>
      </Field>
      {custom && start && typeof start === 'object' && (
        <div className="space-y-2 rounded-lg bg-muted/60 p-2.5">
          <Field label={t('tools.guide.fields.startName')}>
            <Input
              value={start.name}
              maxLength={30}
              placeholder={t('tools.guide.fields.startNamePlaceholder')}
              onChange={(e) =>
                change((d) => ({
                  ...d,
                  config: { ...d.config, start: { ...(d.config.start as typeof start), name: e.target.value } },
                }))
              }
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
              {t('tools.guide.pickOnMap')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {picking
                ? t('tools.guide.picking')
                : start.floor
                  ? t('tools.guide.pickedAt', { floor: PLAN[start.floor].tag })
                  : t('tools.guide.notPicked')}
            </span>
          </div>
        </div>
      )}
      <Field label={t('tools.guide.fields.sign')}>
        <select
          className={selectClass}
          value={draft.config.sign}
          onChange={(e) => change((d) => ({ ...d, config: { ...d.config, sign: e.target.value } }))}
        >
          <option value="">{t('tools.guide.noSign')}</option>
          <option value="起点">{t('tools.guide.sameAsStart')}</option>
          <optgroup label={t('tools.guide.entrances')}>
            {Object.entries(ENTRIES).map(([k, e]) => (
              <option key={k} value={k}>
                {e.label}
              </option>
            ))}
          </optgroup>
          <PlaceOptions />
        </select>
      </Field>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t('tools.guide.fields.activities')}</p>
        {draft.config.activities.map((a, i) => {
          const set = (patch: Partial<typeof a>) =>
            change((d) => ({
              ...d,
              config: {
                ...d.config,
                activities: d.config.activities.map((x, j) => (j === i ? { ...x, ...patch } : x)),
              },
            }))
          return (
            <div key={i} className="grid grid-cols-[24px_1fr_1fr_28px] items-center gap-1.5 rounded-lg border p-2">
              <span className="gd-badge" style={{ background: a.color || PALETTE[i % PALETTE.length] }}>
                {i + 1}
              </span>
              <Input
                data-act-name
                className="col-span-2"
                value={a.name}
                maxLength={40}
                placeholder={t('tools.guide.fields.name')}
                onChange={(e) => set({ name: e.target.value })}
              />
              <button
                className="flex justify-center text-muted-foreground hover:text-destructive"
                aria-label={t('tools.guide.removeActivity')}
                onClick={() =>
                  change((d) => ({
                    ...d,
                    config: { ...d.config, activities: d.config.activities.filter((_, j) => j !== i) },
                  }))
                }
              >
                <X className="size-4" />
              </button>
              <span />
              <select className={selectClass} value={a.place} onChange={(e) => set({ place: e.target.value })}>
                <option value="">{t('tools.guide.fields.place')}</option>
                <PlaceOptions />
              </select>
              <Input
                value={a.time}
                maxLength={30}
                placeholder={t('tools.guide.fields.time')}
                onChange={(e) => set({ time: e.target.value })}
              />
              <span />
            </div>
          )
        })}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            change((d) => ({
              ...d,
              config: { ...d.config, activities: [...d.config.activities, { place: '', name: '', time: '' }] },
            }))
          }
        >
          {t('tools.guide.addActivity')}
        </Button>
        <p className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
          {t('tools.guide.clickRoomTip')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button onClick={() => draft && save.mutate(draft)} disabled={!dirty || save.isPending}>
          {save.isPending ? t('tools.guide.saving') : t('tools.guide.save')}
        </Button>
        {manager && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(t('tools.guide.deleteConfirm', { title: draft.title }))) remove.mutate()
            }}
          >
            <Trash2 className="size-4" />
            {t('tools.guide.delete')}
          </Button>
        )}
      </div>
    </div>
  )

  const labelButtons = (
    <>
      <span className="px-1 text-center text-[11px] text-neutral-400">{t('tools.guide.labels.title')}</span>
      {LABEL_MODES.map((m) => (
        <button
          key={m}
          aria-pressed={labelMode === m}
          className={cn(
            'rounded-lg px-2.5 py-1.5 text-sm font-semibold text-neutral-700',
            labelMode === m ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100',
          )}
          onClick={() => setLabelMode(m)}
        >
          {t(`tools.guide.labels.${m}`)}
        </button>
      ))}
    </>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink council={canEdit} />
        {editing && dirty && (
          <span className="text-xs text-amber-600 dark:text-amber-400">{t('tools.guide.unsaved')}</span>
        )}
      </div>
      <div
        ref={stageRef}
        className="gd-stage h-[calc(100dvh-11rem)] min-h-[520px] rounded-xl border"
      >
        {/* Title */}
        <div
          ref={titleRef}
          className="absolute top-3 left-3 z-10 max-w-[min(460px,calc(100%-24px))] rounded-xl bg-white/90 px-4 py-3 shadow-sm backdrop-blur"
        >
          <h1 className="truncate text-lg font-bold text-neutral-900">{draft?.title}</h1>
          {draft?.subtitle && <p className="truncate text-sm text-neutral-500">{draft.subtitle}</p>}
        </div>

        {/* Floors */}
        <div
          ref={floorsRef}
          className={cn(
            'absolute z-10 flex flex-col gap-1 rounded-xl bg-white/90 p-1.5 shadow-sm backdrop-blur',
            narrow ? 'top-24 right-2' : 'top-1/2 left-3 -translate-y-1/2',
          )}
        >
          {FLOOR_BUTTONS.map((b) => (
            <button
              key={String(b.mode)}
              title={b.mode === 'auto' ? t('tools.guide.autoHint') : undefined}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-sm font-semibold text-neutral-700',
                floorMode === b.mode ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100',
              )}
              onClick={() => sceneRef.current?.setFloorMode(b.mode)}
            >
              {b.label ?? t(`tools.guide.floors.${b.mode}`)}
            </button>
          ))}
          {!narrow && (
            <>
              <div className="mx-1 my-1 border-t border-neutral-200" />
              {labelButtons}
            </>
          )}
        </div>

        {/* On a phone the floor column is already tall: the label choice sits in a row at the bottom. */}
        {narrow && (
          <div className="absolute right-2 bottom-2 z-10 flex items-center gap-1 rounded-xl bg-white/90 p-1.5 shadow-sm backdrop-blur">
            {labelButtons}
          </div>
        )}

        {/* Tools */}
        <div className="absolute top-3 right-3 z-20 flex gap-1.5">
          {canEdit && !editing && (
            <Button size="sm" variant="outline" className="bg-white" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              {t('tools.guide.edit')}
            </Button>
          )}
          <Button size="sm" variant="outline" className="bg-white" onClick={copyLink}>
            <Link2 className="size-4" />
            <span className="hidden sm:inline">{t('tools.guide.copyLink')}</span>
          </Button>
          <div className="relative">
            <Button size="sm" onClick={() => setExportOpen((o) => !o)}>
              <Download className="size-4" />
              <span className="hidden sm:inline">{t('tools.guide.export')}</span>
            </Button>
            {exportOpen && (
              <div className="absolute top-10 right-0 w-52 rounded-xl border bg-white p-1.5 shadow-lg">
                {(['phone', 'a4', 'screen'] as const).map((k) => (
                  <button
                    key={k}
                    className="flex w-full items-baseline gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-100"
                    onClick={() => void runExport(k)}
                  >
                    {t(`tools.guide.exportKinds.${k}`)}
                    <span className="text-xs text-neutral-500">{t(`tools.guide.exportHints.${k}`)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Side panel: the activity list, or the editor */}
        {!narrow && (
          <div
            ref={panelRef}
            className={cn(
              'absolute top-14 right-3 bottom-3 z-10 w-80 overflow-y-auto rounded-xl bg-white/95 p-3 text-neutral-900 shadow-sm backdrop-blur',
              !editing && 'bottom-auto max-h-[calc(100%-4.5rem)]',
            )}
          >
            {editing ? editor : listPanel}
          </div>
        )}

        {!narrow && (
          <p className="absolute bottom-3 left-3 z-10 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-neutral-500 shadow-sm">
            {t('tools.guide.hint')}
          </p>
        )}
      </div>

      {/* On a phone the list and the editor sit under the map. */}
      {narrow && (
        <div ref={panelRef} className="rounded-xl border bg-card p-3">
          {editing ? editor : listPanel}
        </div>
      )}
    </div>
  )
}

// The council goes back to its 学生会 page; everyone else to today's events.
function BackLink({ council }: { council: boolean }) {
  const { t } = useTranslation()
  return (
    <Link
      to={council ? '/council' : '/tools/guide'}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {council ? t('nav.council') : t('tools.guide.back')}
    </Link>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function PlaceOptions() {
  return (
    <>
      {PLACES.map((p) => (
        <optgroup key={p.floor} label={p.tag}>
          {p.names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}

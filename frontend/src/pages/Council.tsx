import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, LogOut, Pencil, Plus, Search, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CouncilIcon } from '@/components/BadgeIcons'
import { cn } from '@/lib/utils'
import { MY_BADGES_KEY } from '@/api/profile'
import {
  COUNCIL_KEY,
  GUIDE_EVENTS_KEY,
  GUIDE_STARS_KEY,
  beijingToday,
  addMember,
  createGuideEvent,
  leaveCouncil,
  removeMember,
  removeVice,
  searchCouncilUsers,
  unstarActivity,
  updateStarNote,
  useCouncil,
  useGuideEvents,
  useGuideStars,
  type CouncilPerson,
  type CouncilStatus,
  type GuideEventSummary,
  type StarredActivity,
} from '@/api/guide'

// 「学生会」 (in the navigation after 排行榜, only for the council — migration 0034): the events of
// 「活动指南」, which only the council sees outside their open days, and the vice and members (the
// president adds and removes members here; their codes are on the badge wall).
export function Council() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const council = useCouncil()
  const leave = useMutation({
    mutationFn: leaveCouncil,
    onSuccess: (s) => {
      queryClient.setQueryData(COUNCIL_KEY, s)
      void queryClient.invalidateQueries({ queryKey: MY_BADGES_KEY })
      toast.success(t('council.left'))
      navigate('/')
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const c = council.data
  const events = useGuideEvents(!!c?.role)
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language)

  if (council.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>
  if (council.isError) return <p className="text-destructive">{council.error.message}</p>
  if (!c?.role || !c.term)
    return <p className="text-muted-foreground">{t('council.notMember')}</p>
  const leader = c.role === 'president' || c.role === 'vice'

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-red-500 via-red-700 to-rose-950 text-white">
          <CouncilIcon className="size-9" />
        </span>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('council.title')}</h1>
          <p className="text-muted-foreground">
            {t(`council.you.${c.role}`, { term: c.term })}
            {c.expires_at && ` ${t('council.expires', { date: date(c.expires_at) })}`}
          </p>
        </div>
        {c.role === 'member' && (
          <Button
            variant="outline"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={leave.isPending}
            onClick={() => confirm(t('council.leaveConfirm')) && leave.mutate()}
          >
            <LogOut className="size-4" />
            {t('council.leave')}
          </Button>
        )}
      </header>

      <EventsSection leader={leader} events={events.data} loading={events.isPending} />

      <StarsSection />

      <MembersSection council={c} />
    </div>
  )
}

function EventsSection({
  leader,
  events,
  loading,
}: {
  leader: boolean
  events: GuideEventSummary[] | undefined
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: () =>
      createGuideEvent({
        title: t('tools.guide.untitled'),
        subtitle: '',
        config: { start: '二楼连廊', sign: '', activities: [] },
        open_from: null,
        open_to: null,
      }),
    onSuccess: (ev) => {
      void queryClient.invalidateQueries({ queryKey: GUIDE_EVENTS_KEY })
      navigate(`/tools/guide/${ev.id}?edit=1`)
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const day = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })
  const today = beijingToday()
  const openState = (e: GuideEventSummary) => {
    if (!e.open_from || !e.open_to) return { text: t('council.events.notOpen'), live: false }
    const range =
      e.open_from === e.open_to ? day(e.open_from) : `${day(e.open_from)}–${day(e.open_to)}`
    if (today < e.open_from) return { text: t('council.events.opens', { range }), live: false }
    if (today > e.open_to) return { text: t('council.events.ended', { range }), live: false }
    return { text: t('council.events.openNow', { range }), live: true }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t('council.events.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('council.events.hint')}</p>
        </div>
        {leader && (
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="size-4" />
            {t('tools.guide.newEvent')}
          </Button>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !events?.length ? (
        <p className="text-sm text-muted-foreground">
          {leader ? t('tools.guide.emptyPlanner') : t('tools.guide.empty')}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((ev) => {
            const open = openState(ev)
            return (
              <Link key={ev.id} to={`/tools/guide/${ev.id}`} className="group">
                <Card className="h-full gap-2 p-5 transition-colors group-hover:border-primary/50">
                  <p className="truncate text-lg font-semibold">{ev.title}</p>
                  {ev.subtitle && (
                    <p className="truncate text-sm text-muted-foreground">{ev.subtitle}</p>
                  )}
                  <p
                    className={cn(
                      'w-fit rounded-full px-2 py-0.5 text-xs font-medium',
                      open.live
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {open.text}
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    {t('tools.guide.activityCount', { count: ev.activity_count })}
                  </p>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

// 星标活动: the activities that went well — starred by the council once their event ended, or by
// themselves for the most likes — newest event first, each with a note anyone on the council
// may write. They stay here after their event is deleted.
const NOTE_MAX = 200

function StarsSection() {
  const { t } = useTranslation()
  const stars = useGuideStars()

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Star className="size-5 fill-amber-400 text-amber-500" />
          {t('council.stars.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('council.stars.hint')}</p>
      </div>
      {stars.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : stars.isError ? (
        <p className="text-sm text-destructive">{stars.error.message}</p>
      ) : !stars.data.length ? (
        <p className="text-sm text-muted-foreground">{t('council.stars.empty')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stars.data.map((s) => (
            <StarCard key={s.id} star={s} />
          ))}
        </div>
      )}
    </section>
  )
}

function StarCard({ star: s }: { star: StarredActivity }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<string | null>(null) // the note being written; null = not editing
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: GUIDE_STARS_KEY })
    if (s.event_id) void queryClient.invalidateQueries({ queryKey: ['guide-event', s.event_id] })
  }
  const save = useMutation({
    mutationFn: (note: string) => updateStarNote(s.id, note),
    onSuccess: () => {
      setDraft(null)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => unstarActivity(s.id),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  })
  const day = s.event_day
    ? new Date(`${s.event_day}T00:00:00`).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null
  const title = (
    <>
      <p className="truncate text-lg font-semibold">{s.name || t('council.stars.unnamed')}</p>
      <p className="truncate text-sm text-muted-foreground">
        {[s.event_title, day, s.place].filter(Boolean).join(' · ')}
      </p>
    </>
  )

  return (
    <Card className="h-full gap-2 p-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {s.event_id ? (
            <Link to={`/tools/guide/${s.event_id}`} className="block hover:text-primary">
              {title}
            </Link>
          ) : (
            title
          )}
        </div>
        <button
          aria-label={t('tools.guide.unstar')}
          title={t('tools.guide.unstar')}
          disabled={remove.isPending}
          className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() =>
            confirm(t(s.auto ? 'tools.guide.unstarAutoConfirm' : 'tools.guide.unstarConfirm')) &&
            remove.mutate()
          }
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
            s.auto
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
          )}
        >
          <Star className="size-3 fill-current" />
          {t(s.auto ? 'council.stars.auto' : 'council.stars.council')}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
          <Heart className="size-3.5" />
          {t('tools.guide.likes', { count: s.likes })}
        </span>
      </div>
      {draft === null ? (
        <div className="flex items-start gap-1">
          <p
            className={cn(
              'min-w-0 flex-1 text-sm whitespace-pre-wrap',
              !s.note && 'text-muted-foreground',
            )}
          >
            {s.note || t('council.stars.noNote')}
          </p>
          <button
            aria-label={t('council.stars.editNote')}
            title={t('council.stars.editNote')}
            className="-mr-2 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setDraft(s.note)}
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(draft.trim())
          }}
        >
          <textarea
            autoFocus
            rows={3}
            maxLength={NOTE_MAX}
            value={draft}
            placeholder={t('council.stars.notePlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-muted-foreground tabular-nums">
              {draft.length}/{NOTE_MAX}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

// The vice and the members, for everyone on the council to see. The president adds members by
// name (once a year, when the council forms) and removes them, and can remove the vice; the
// 副会长码 and 传承码 are under 「现任鲦行知」 on the badge wall.
function MembersSection({ council: c }: { council: CouncilStatus }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const president = c.role === 'president'
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(id)
  }, [query])
  const found = useQuery({
    queryKey: ['council-users', debounced],
    queryFn: () => searchCouncilUsers(debounced),
    enabled: president && debounced.length > 0,
  })
  const done = (s: CouncilStatus) => queryClient.setQueryData(COUNCIL_KEY, s)
  const fail = (e: Error) => toast.error(e.message)
  const add = useMutation({
    mutationFn: (p: CouncilPerson) => addMember(p.id),
    onSuccess: (s, p) => {
      done(s)
      toast.success(t('council.members.added', { name: p.display_name }))
    },
    onError: fail,
  })
  const drop = useMutation({
    mutationFn: (p: CouncilPerson) => removeMember(p.id),
    onSuccess: (s, p) => {
      done(s)
      toast.success(t('council.members.removed', { name: p.display_name }))
    },
    onError: fail,
  })
  const dismiss = useMutation({
    mutationFn: removeVice,
    onSuccess: (s) => {
      done(s)
      toast.success(t('council.vice.removed'))
    },
    onError: fail,
  })
  const busy = add.isPending || drop.isPending || dismiss.isPending
  const onCouncil = (id: string) => c.vice?.id === id || c.members.some((m) => m.id === id)

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">
          {t('council.members.title', { count: c.members.length })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(president ? 'council.members.hintPresident' : 'council.members.hint')}
        </p>
      </div>
      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('council.vice.title')}</span>
          {c.vice ? (
            <>
              <span className="font-medium">{c.vice.display_name}</span>
              {president && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() =>
                    confirm(
                      t('council.vice.removeConfirm', { name: c.vice?.display_name, term: c.term }),
                    ) && dismiss.mutate()
                  }
                >
                  {t('council.vice.remove')}
                </Button>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">{t('council.vice.none')}</span>
          )}
        </div>
        {c.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('council.members.none')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {c.members.map((m) => (
              <li
                key={m.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border bg-muted/60 py-1 text-sm',
                  president ? 'pr-1 pl-3' : 'px-3',
                )}
              >
                {m.display_name}
                {president && (
                  <button
                    className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                    aria-label={t('council.members.remove', { name: m.display_name })}
                    disabled={busy}
                    onClick={() =>
                      confirm(t('council.members.removeConfirm', { name: m.display_name })) &&
                      drop.mutate(m)
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {president && (
          <div className="space-y-2 border-t pt-4">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                maxLength={50}
                className="pl-8"
                placeholder={t('council.members.search')}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {debounced && found.data && (
              <ul className="max-w-sm space-y-1">
                {found.data.length === 0 ? (
                  <li className="text-xs text-muted-foreground">
                    {t('council.members.noMatch', { query: debounced })}
                  </li>
                ) : (
                  found.data.map((p) => {
                    const already = onCouncil(p.id)
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">
                          {p.display_name}
                          {p.grade && (
                            <span className="text-xs text-muted-foreground"> · {p.grade}</span>
                          )}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={already || busy}
                          onClick={() => add.mutate(p)}
                        >
                          {already ? (
                            t('council.members.already')
                          ) : (
                            <>
                              <Plus className="size-3.5" />
                              {t('council.members.add')}
                            </>
                          )}
                        </Button>
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

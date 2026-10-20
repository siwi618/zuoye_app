import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, CircleDot, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listRequests, type RequestRead } from '@/api/requests'
import { RequestCard } from '@/components/RequestCard'
import { useAuthStore } from '@/store/auth'

const DASHBOARD_LIMIT = 5

function Section({
  title,
  emptyHint,
  data,
  loading,
  error,
  moreTo,
  Icon,
  tint,
}: {
  title: string
  emptyHint: string
  data: RequestRead[] | undefined
  loading: boolean
  error: unknown
  moreTo: string
  Icon: typeof CircleDot
  tint: string
}) {
  const { t } = useTranslation()
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`grid size-9 place-items-center rounded-xl ${tint}`}>
          <Icon className="size-4.5" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <Link
          to={moreTo}
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('dashboard.browseAll')}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : error ? (
        <p className="text-destructive">
          {error instanceof Error ? error.message : t('common.error')}
        </p>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </section>
  )
}

export function Dashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    ''

  // Top: the newest open requests other students posted — what the user can pick up.
  const openOthers = useQuery({
    queryKey: ['requests', { status: 'open', exclude_mine: true, limit: DASHBOARD_LIMIT }],
    queryFn: () => listRequests({ status: 'open', exclude_mine: true, limit: DASHBOARD_LIMIT }),
  })

  // Bottom: the most recently completed requests, across all users.
  const completedRecent = useQuery({
    queryKey: ['requests', { status: 'completed', limit: DASHBOARD_LIMIT }],
    queryFn: () => listRequests({ status: 'completed', limit: DASHBOARD_LIMIT }),
  })

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-brand-100 via-card to-card px-6 py-8 shadow-soft sm:px-10 sm:py-10">
        <div
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-12 size-72 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200/70 backdrop-blur">
              <Sparkles className="size-3.5" />
              {t('app.tagline')}
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {displayName ? `Hi, ${displayName}` : t('nav.dashboard')}
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              {t('dashboard.heroHint')}
            </p>
          </div>
          <Link to="/requests/new">
            <Button size="lg" className="shadow-soft">
              <Plus className="size-4" />
              {t('dashboard.newRequest')}
            </Button>
          </Link>
        </div>
      </section>

      <Section
        title={t('dashboard.latestOpenRequests')}
        emptyHint={t('dashboard.openEmpty')}
        data={openOthers.data}
        loading={openOthers.isLoading}
        error={openOthers.error}
        moreTo="/requests"
        Icon={CircleDot}
        tint="bg-brand-100 text-brand-700"
      />

      <Section
        title={t('dashboard.recentCompletedRequests')}
        emptyHint={t('dashboard.completedEmpty')}
        data={completedRecent.data}
        loading={completedRecent.isLoading}
        error={completedRecent.error}
        moreTo="/history"
        Icon={CheckCircle2}
        tint="bg-emerald-50 text-emerald-700"
      />
    </div>
  )
}

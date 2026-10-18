import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Mail } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RequestCard } from '@/components/RequestCard'
import { listRequests } from '@/api/requests'
import { useAuthStore } from '@/store/auth'

export function Profile() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  const mine = useQuery({
    queryKey: ['requests', { mine: true, status: 'completed' }],
    queryFn: () => listRequests({ mine: true, status: 'completed' }),
  })

  const completed = useMemo(() => mine.data ?? [], [mine.data])
  const displayName = (user?.user_metadata?.display_name as string | undefined) ?? user?.email
  const initials = (displayName ?? '?').toString().trim().slice(0, 2).toUpperCase()

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Card className="overflow-hidden p-0">
        <div className="relative h-28 bg-gradient-to-br from-brand-700 via-primary to-brand-600">
          <div className="absolute inset-0 bg-grid-faint opacity-25 mix-blend-soft-light" aria-hidden />
        </div>
        <CardContent className="pb-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <Avatar className="size-20 ring-4 ring-background">
              <AvatarFallback className="bg-brand-100 text-2xl font-semibold text-brand-700">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="mb-1 space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
              <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="size-3.5" />
                {user?.email ?? '—'}
              </p>
            </div>
            <div className="mb-1 ml-auto rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
              {completed.length} {t('profile.completedRequests').toLowerCase()}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="size-4.5" />
          </span>
          <h2 className="text-xl font-semibold tracking-tight">{t('profile.completedRequests')}</h2>
        </div>
        {mine.isLoading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : mine.isError ? (
          <p className="text-destructive">
            {mine.error instanceof Error ? mine.error.message : t('common.error')}
          </p>
        ) : completed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
            {t('profile.noCompleted')}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

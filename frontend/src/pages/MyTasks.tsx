import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Handshake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listRequests } from '@/api/requests'
import { RequestCard } from '@/components/RequestCard'

// Requests the current user accepted as helper and hasn't completed yet.
export function MyTasks() {
  const { t } = useTranslation()

  const query = useQuery({
    queryKey: ['requests', { status: 'accepted', helping: true }],
    queryFn: () => listRequests({ status: 'accepted', helping: true, limit: 200 }),
  })

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.myTasks')}</h1>
        <p className="text-muted-foreground">{t('dashboard.myTasksSubtitle')}</p>
      </header>

      {query.isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : query.isError ? (
        <p className="text-destructive">
          {query.error instanceof Error ? query.error.message : t('common.error')}
        </p>
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
            <Handshake className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">{t('dashboard.myTasksEmpty')}</p>
          <Link to="/requests">
            <Button variant="outline" size="sm">
              {t('nav.browse')}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data!.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Filter, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listRequests, type RequestStatus } from '@/api/requests'
import { RequestCard } from '@/components/RequestCard'
import { SUBJECT_OPTIONS, GRADE_OPTIONS } from '@/lib/constants'

const ANY = '__any__'

export function BrowseRequests() {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState<RequestStatus | typeof ANY>('open')
  const [subject, setSubject] = useState<string>(ANY)
  const [grade, setGrade] = useState<string>(ANY)

  const query = useQuery({
    queryKey: ['requests', { statusFilter, subject, grade }],
    queryFn: () =>
      listRequests({
        status: statusFilter === ANY ? undefined : statusFilter,
        subject: subject === ANY ? undefined : subject,
        grade: grade === ANY ? undefined : grade,
      }),
  })

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('nav.browse')}</h1>
          <p className="text-muted-foreground">{t('dashboard.browseSubtitle')}</p>
        </div>
        <Link to="/requests/new">
          <Button>
            <Plus className="size-4" />
            {t('dashboard.newRequest')}
          </Button>
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur">
        <span className="ml-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="size-3.5" />
          {t('dashboard.filterStatus')}
        </span>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as RequestStatus | typeof ANY)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('dashboard.filterAnyStatus')}</SelectItem>
            <SelectItem value="open">{t('status.open')}</SelectItem>
            <SelectItem value="accepted">{t('status.accepted')}</SelectItem>
            <SelectItem value="completed">{t('status.completed')}</SelectItem>
            <SelectItem value="cancelled">{t('status.cancelled')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('dashboard.filterAnySubject')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('dashboard.filterAnySubject')}</SelectItem>
            {SUBJECT_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`subjects.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('dashboard.filterAnyGrade')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('dashboard.filterAnyGrade')}</SelectItem>
            {GRADE_OPTIONS.map((g) => (
              <SelectItem key={g} value={g}>
                {t(`grades.${g}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== 'open' || subject !== ANY || grade !== ANY) && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => {
              setStatusFilter('open')
              setSubject(ANY)
              setGrade(ANY)
            }}
          >
            {t('common.cancel')}
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : query.isError ? (
        <p className="text-destructive">
          {query.error instanceof Error ? query.error.message : t('common.error')}
        </p>
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
            <Search className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">{t('dashboard.filterEmpty')}</p>
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

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Filter, Handshake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listRequests } from '@/api/requests'
import { RequestCard } from '@/components/RequestCard'
import { GRADE_OPTIONS, SUBJECT_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const ANY = '__any__'

type Tab = 'ongoing' | 'history'

// Requests the current user accepted as helper: in progress, or completed.
export function MyTasks() {
  const { t } = useTranslation()
  // The tab lives in the URL (?tab=history) so it survives back/forward and can be linked.
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'history' ? 'history' : 'ongoing'
  const [subject, setSubject] = useState<string>(ANY)
  const [grade, setGrade] = useState<string>(ANY)

  const status = tab === 'history' ? 'completed' : 'accepted'
  const query = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['requests', { status, helping: true, subject, grade }],
    queryFn: () =>
      listRequests({
        status,
        helping: true,
        subject: subject === ANY ? undefined : subject,
        grade: grade === ANY ? undefined : grade,
        limit: 200,
      }),
  })

  const tabs: { value: Tab; label: string }[] = [
    { value: 'ongoing', label: t('dashboard.tabOngoing') },
    { value: 'history', label: t('dashboard.tabHistory') },
  ]
  const filtered = subject !== ANY || grade !== ANY

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.myTasks')}</h1>
        <p className="text-muted-foreground">
          {tab === 'history' ? t('dashboard.myHistorySubtitle') : t('dashboard.myTasksSubtitle')}
        </p>
      </header>

      <div className="space-y-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setParams(item.value === 'history' ? { tab: 'history' } : {})}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                tab === item.value
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-muted-foreground hover:bg-secondary',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="ml-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="size-3.5" />
            {t('dashboard.filterCategory')}
          </span>
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

          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={() => {
                setSubject(ANY)
                setGrade(ANY)
              }}
            >
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : query.isError ? (
        <p className="text-destructive">
          {query.error instanceof Error ? query.error.message : t('common.error')}
        </p>
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          {tab === 'history' ? (
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="size-5" />
            </span>
          ) : (
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              <Handshake className="size-5" />
            </span>
          )}
          <p className="text-sm text-muted-foreground">
            {filtered
              ? t('dashboard.filterEmpty')
              : tab === 'history'
                ? t('dashboard.myHistoryEmpty')
                : t('dashboard.myTasksEmpty')}
          </p>
          {!filtered && tab === 'ongoing' && (
            <Link to="/requests">
              <Button variant="outline" size="sm">
                {t('nav.browse')}
              </Button>
            </Link>
          )}
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

import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listRequests, type ListRequestsParams } from '@/api/requests'
import { RequestCard } from '@/components/RequestCard'
import { GRADE_OPTIONS, SUBJECT_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const ANY = '__any__'

export interface RequestTab {
  label: string
  subtitle: string
  // Which requests this tab lists (subject / grade filters are added on top).
  params: ListRequestsParams
  // Optional status chips after "All"; each replaces the tab's params.
  categories?: { key: string; label: string; params: ListRequestsParams }[]
  empty: ReactNode
}

// Shared layout for My Requests and My Tasks: an "in progress" tab and a
// "history" tab, with subject / grade filters. The tab lives in the URL
// (?tab=history) so it survives back/forward and can be linked to.
export function TabbedRequestList({
  title,
  action,
  ongoing,
  history,
}: {
  title: string
  action?: ReactNode
  ongoing: RequestTab
  history: RequestTab
}) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const isHistory = params.get('tab') === 'history'
  const tab = isHistory ? history : ongoing
  const [category, setCategory] = useState<string>(ANY)
  const listParams = tab.categories?.find((c) => c.key === category)?.params ?? tab.params
  const [subject, setSubject] = useState<string>(ANY)
  const [grade, setGrade] = useState<string>(ANY)
  const filtered = subject !== ANY || grade !== ANY

  const query = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['requests', { ...listParams, subject, grade }],
    queryFn: () =>
      listRequests({
        ...listParams,
        subject: subject === ANY ? undefined : subject,
        grade: grade === ANY ? undefined : grade,
        limit: 200,
      }),
  })

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{tab.subtitle}</p>
        </div>
        {action}
      </header>

      <div className="space-y-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'ongoing', label: ongoing.label, active: !isHistory },
            { key: 'history', label: history.label, active: isHistory },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setParams(item.key === 'history' ? { tab: 'history' } : {})
                setCategory(ANY)
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                item.active
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-muted-foreground hover:bg-secondary',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab.categories && (
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
            {[{ key: ANY, label: t('dashboard.filterAll') }, ...tab.categories].map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  category === c.key
                    ? 'bg-foreground text-background ring-foreground'
                    : 'text-muted-foreground ring-border hover:bg-secondary',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

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
          {filtered ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.filterEmpty')}</p>
          ) : (
            tab.empty
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

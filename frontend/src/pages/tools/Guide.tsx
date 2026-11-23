import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useCouncil, useGuideEvents } from '@/api/guide'

// 「活动指南」 in the toolbox: the events open today (the toolbox shows it only then). The student
// council sees every event here too, but runs them from its 学生会 page.
export function Guide() {
  const { t } = useTranslation()
  const events = useGuideEvents()
  const council = useCouncil()

  return (
    <div className="space-y-6">
      <Link
        to="/tools"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('tools.title')}
      </Link>
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('tools.guide.title')}</h1>
        <p className="text-muted-foreground">{t('tools.guide.subtitle')}</p>
        {council.data?.role && (
          <p className="text-sm">
            <Link to="/council" className="text-primary underline-offset-4 hover:underline">
              {t('tools.guide.manageInCouncil')}
            </Link>
          </p>
        )}
      </header>

      {events.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : events.isError ? (
        <p className="text-sm text-destructive">{events.error.message}</p>
      ) : events.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('tools.guide.noneToday')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.data.map((ev) => (
            <Link key={ev.id} to={`/tools/guide/${ev.id}`} className="group">
              <Card className="h-full gap-2 p-5 transition-colors group-hover:border-primary/50">
                <p className="truncate text-lg font-semibold">{ev.title}</p>
                {ev.subtitle && (
                  <p className="truncate text-sm text-muted-foreground">{ev.subtitle}</p>
                )}
                <p className="text-xs text-muted-foreground/80">
                  {t('tools.guide.activityCount', { count: ev.activity_count })}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

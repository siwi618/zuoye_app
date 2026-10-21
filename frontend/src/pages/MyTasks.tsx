import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Handshake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabbedRequestList } from '@/components/TabbedRequestList'

// Requests the current user accepted as helper: in progress, or completed.
export function MyTasks() {
  const { t } = useTranslation()

  return (
    <TabbedRequestList
      title={t('nav.myTasks')}
      ongoing={{
        label: t('dashboard.tabOngoing'),
        subtitle: t('dashboard.myTasksSubtitle'),
        // In progress, and completed ones you still have to rate.
        params: { status: ['accepted', 'completed'], awaiting_review: true, helping: true },
        categories: [
          {
            key: 'accepted',
            label: t('status.accepted'),
            params: { status: 'accepted', helping: true },
          },
          {
            key: 'review',
            label: t('status.review'),
            params: { status: 'completed', awaiting_review: true, helping: true },
          },
        ],
        empty: (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              <Handshake className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{t('dashboard.myTasksEmpty')}</p>
            <Link to="/requests">
              <Button variant="outline" size="sm">
                {t('nav.browse')}
              </Button>
            </Link>
          </>
        ),
      }}
      history={{
        label: t('dashboard.tabHistory'),
        subtitle: t('dashboard.myHistorySubtitle'),
        params: { status: 'completed', awaiting_review: false, helping: true },
        empty: (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{t('dashboard.myHistoryEmpty')}</p>
          </>
        ),
      }}
    />
  )
}

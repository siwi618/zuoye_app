import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabbedRequestList } from '@/components/TabbedRequestList'

// Requests the current user posted: waiting / in progress, or completed.
export function MyRequests() {
  const { t } = useTranslation()

  return (
    <TabbedRequestList
      title={t('nav.myRequests')}
      action={
        <Link to="/requests/new">
          <Button>
            <Plus className="size-4" />
            {t('dashboard.newRequest')}
          </Button>
        </Link>
      }
      ongoing={{
        label: t('dashboard.tabOngoing'),
        subtitle: t('dashboard.myRequestsSubtitle'),
        // Waiting, in progress, and completed ones you still have to rate.
        params: { status: ['open', 'accepted', 'completed'], awaiting_review: true, posted: true },
        categories: [
          { key: 'open', label: t('status.open'), params: { status: 'open', posted: true } },
          {
            key: 'accepted',
            label: t('status.accepted'),
            params: { status: 'accepted', posted: true },
          },
          {
            key: 'review',
            label: t('status.review'),
            params: { status: 'completed', awaiting_review: true, posted: true },
          },
        ],
        empty: (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
              <FileText className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{t('dashboard.myRequestsEmpty')}</p>
          </>
        ),
      }}
      history={{
        label: t('dashboard.tabRequestHistory'),
        subtitle: t('dashboard.myRequestHistorySubtitle'),
        params: { status: 'completed', awaiting_review: false, posted: true },
        empty: (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{t('dashboard.myRequestHistoryEmpty')}</p>
          </>
        ),
      }}
    />
  )
}

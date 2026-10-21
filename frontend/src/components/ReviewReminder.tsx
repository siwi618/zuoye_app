import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Star, X } from 'lucide-react'
import { listRequests } from '@/api/requests'

const DISMISS_KEY = 'review-reminder-dismissed'

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

// Pink, dismissible nudge (like the grade reminder) while the user has
// completed requests they haven't rated yet. Links to the oldest-listed one.
export function ReviewReminder() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(wasDismissed)

  const pending = useQuery({
    queryKey: ['pending-reviews'],
    queryFn: () =>
      listRequests({ status: 'completed', mine: true, awaiting_review: true, limit: 50 }),
    staleTime: 60_000,
  })
  const items = pending.data ?? []

  // Already on one of them: the rating form is right there.
  const onPendingPage = items.some((r) => pathname === `/requests/${r.id}`)
  if (dismissed || items.length === 0 || onPendingPage) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // storage unavailable — dismiss for this page view only
    }
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-pink-300 bg-pink-50 px-4 py-3 text-sm text-pink-800 dark:border-pink-700/50 dark:bg-pink-900/30 dark:text-pink-100">
      <Star className="mt-0.5 size-4 shrink-0 text-pink-500" />
      <p className="flex-1">
        {t('dashboard.reviewReminder', { count: items.length })}{' '}
        <Link
          to={`/requests/${items[0].id}`}
          className="font-semibold underline underline-offset-2 hover:text-pink-900 dark:hover:text-white"
        >
          {t('dashboard.reviewReminderAction')}
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('profile.gradeReminderDismiss')}
        className="rounded-md p-0.5 text-pink-600 transition-colors hover:bg-pink-100 dark:hover:bg-pink-800/50"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

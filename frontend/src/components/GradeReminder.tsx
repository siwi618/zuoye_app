import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, X } from 'lucide-react'
import { useMyProfile } from '@/api/profile'

const DISMISS_KEY = 'grade-reminder-dismissed'

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

// Yellow, dismissible nudge for users who haven't confirmed a default grade.
// Not enforced: they can still pick a grade by hand on each request.
export function GradeReminder() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const profile = useMyProfile()
  const [dismissed, setDismissed] = useState(wasDismissed)

  if (dismissed || pathname === '/profile' || !profile.data || profile.data.grade) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // storage unavailable — dismiss for this page view only
    }
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
      <p className="flex-1">
        {t('profile.gradeReminder')}{' '}
        <Link to="/profile" className="font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-white">
          {t('profile.gradeReminderAction')}
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('profile.gradeReminderDismiss')}
        className="rounded-md p-0.5 text-amber-600 transition-colors hover:bg-amber-100 dark:hover:bg-amber-800/50"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

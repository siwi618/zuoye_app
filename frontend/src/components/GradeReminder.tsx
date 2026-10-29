import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMyProfile } from '@/api/profile'
import { SettingsReminder } from '@/components/SettingsReminder'

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
    <SettingsReminder
      message={t('profile.gradeReminder')}
      action={{ label: t('profile.gradeReminderAction'), to: '/profile' }}
      onDismiss={dismiss}
      dismissLabel={t('profile.gradeReminderDismiss')}
    />
  )
}

import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SettingsReminder } from '@/components/SettingsReminder'
import { nextMonday, saveToolSettings, useToolSettings } from '@/lib/toolSettings'

// Wraps every tool page (/tools/<tool>): settings that apply to all tools live here.
export function ToolShell() {
  const { pathname } = useLocation()
  return (
    <>
      <AutoZeroReminder key={pathname} />
      <Outlet />
    </>
  )
}

// Shown each time a tool opens, unless auto-zero is on or the user snoozed it for the week.
function AutoZeroReminder() {
  const { t } = useTranslation()
  const settings = useToolSettings()
  const [hidden, setHidden] = useState(false)
  const [openedAt] = useState(Date.now)
  const until = settings.autoZeroTipUntil
  const snoozed = until !== null && Date.parse(until) > openedAt

  if (hidden || snoozed || !settings.loaded || settings.autoZero) return null

  const notThisWeek = async () => {
    setHidden(true)
    try {
      await saveToolSettings({ auto_zero_tip_until: nextMonday().toISOString() })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error'))
    }
  }

  return (
    <SettingsReminder
      message={t('tools.autoZeroTip.title')}
      action={{ label: t('tools.autoZeroTip.go'), to: '/profile#tool-settings' }}
      secondary={{ label: t('tools.autoZeroTip.notThisWeek'), onClick: notThisWeek }}
      onDismiss={() => setHidden(true)}
      dismissLabel={t('tools.autoZeroTip.dismiss')}
    />
  )
}

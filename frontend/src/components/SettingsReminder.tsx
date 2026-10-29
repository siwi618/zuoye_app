import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'

// Yellow strip at the top of the page nudging the user toward a setting in their profile.
// Every settings reminder uses this look (default grade, auto-zero, …).
export function SettingsReminder({
  message,
  action,
  secondary,
  onDismiss,
  dismissLabel,
}: {
  message: ReactNode
  action: { label: string; to: string }
  secondary?: { label: string; onClick: () => void }
  onDismiss: () => void
  dismissLabel: string
}) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
      <p className="flex-1">
        {message}{' '}
        <Link
          to={action.to}
          className="font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-white"
        >
          {action.label}
        </Link>
        {secondary && (
          <button
            type="button"
            onClick={secondary.onClick}
            className="ml-3 text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-200 dark:hover:text-white"
          >
            {secondary.label}
          </button>
        )}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="rounded-md p-0.5 text-amber-600 transition-colors hover:bg-amber-100 dark:hover:bg-amber-800/50"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

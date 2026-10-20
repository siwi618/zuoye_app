import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { GraduationCap, MessagesSquare, Sparkles, Trophy } from 'lucide-react'
import { Brand } from '@/components/Brand'

interface AuthShellProps {
  children: ReactNode
}

export function AuthShell({ children }: AuthShellProps) {
  const { t } = useTranslation()

  const points = [
    { Icon: MessagesSquare, label: t('auth.featPost') },
    { Icon: GraduationCap, label: t('auth.featLearn') },
    { Icon: Trophy, label: t('auth.featRank') },
  ]

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-primary to-brand-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-30 mix-blend-soft-light bg-grid-faint"
          aria-hidden
        />
        <div className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-white/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />

        <div className="relative">
          <Brand size="md" withWordmark className="text-white [&_span:last-child]:text-white" />
        </div>

        <div className="relative space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-inset ring-white/25 backdrop-blur">
            <Sparkles className="size-3.5" />
            {t('app.tagline')}
          </div>
          <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            {t('auth.heroTitle')}
          </h2>
          <p className="max-w-md text-white/85">{t('auth.heroSubtitle')}</p>

          <ul className="space-y-3 pt-2">
            {points.map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-white/90">
                <span className="grid size-9 place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25">
                  <Icon className="size-4.5" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/70">© {new Date().getFullYear()} Coral Study</p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center">
            <Brand size="lg" />
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

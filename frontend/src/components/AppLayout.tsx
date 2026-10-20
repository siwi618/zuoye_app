import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Languages, LogOut, UserRound } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/Brand'
import { GradeReminder } from '@/components/GradeReminder'
import { ModerationAlert } from '@/components/ModerationAlert'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const toggleLang = () => {
    void i18n.changeLanguage(i18n.language.startsWith('zh') ? 'en' : 'zh')
  }

  const initials = (user?.user_metadata?.display_name ?? user?.email ?? '?')
    .toString()
    .trim()
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <Link to="/" aria-label="Home">
            <Brand size="md" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {[
              { to: '/', label: t('nav.dashboard'), end: true },
              { to: '/requests', label: t('nav.browse') },
              { to: '/history', label: t('nav.history') },
              { to: '/forum', label: t('nav.forum') },
              { to: '/leaderboard', label: t('nav.leaderboard') },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span>{item.label}</span>
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-x-3 -bottom-[18px] h-[3px] rounded-full bg-primary transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="gap-1.5 rounded-full text-muted-foreground hover:text-foreground"
            >
              <Languages className="size-4" />
              {i18n.language.startsWith('zh') ? 'EN' : '中'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-10 w-10 rounded-full p-0 ring-1 ring-border hover:ring-primary/50"
                >
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-brand-100 font-semibold text-brand-700">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-xl">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {user?.user_metadata?.display_name ?? t('nav.profile')}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <UserRound className="mr-2 size-4" />
                  {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 size-4" />
                  {t('nav.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* mobile nav row */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-3 py-2 md:hidden">
          {[
            { to: '/', label: t('nav.dashboard'), end: true },
            { to: '/requests', label: t('nav.browse') },
            { to: '/history', label: t('nav.history') },
            { to: '/forum', label: t('nav.forum') },
            { to: '/leaderboard', label: t('nav.leaderboard') },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-muted-foreground hover:bg-secondary',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <GradeReminder />
        <Outlet />
      </main>
      <ModerationAlert />
    </div>
  )
}

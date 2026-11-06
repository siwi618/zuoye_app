import { useState, type ComponentType, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Award, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MY_BADGES_KEY, redeemBadgeCode, useMyBadges, type BadgeKey } from '@/api/profile'
import { cn } from '@/lib/utils'

// 「鱼果」: a fish head drawn inside an apple (鱼果 sounds like 雨果, and the fish fits the sea).
function YuguoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          strokeWidth="2.2"
          d="M24 13.5C20.5 10.5 9.5 10 8.6 20.5C7.8 30 14.5 41 19.6 41C21.6 41 22.6 40.1 24 40.1C25.4 40.1 26.4 41 28.4 41C33.5 41 40.2 30 39.4 20.5C38.5 10 27.5 10.5 24 13.5Z"
        />
        <path strokeWidth="2.2" d="M24 13.5C24 10.5 25 8 27.5 6" />
        <path strokeWidth="1.8" d="M25.6 9.6C27.6 6.4 31.8 5.6 34 6.8C32.6 9.8 28.4 10.8 25.6 9.6Z" />
        <path
          strokeWidth="2"
          d="M13.6 20.8C19.5 18.6 27.6 19.4 31.8 23.4C33.4 24.9 34.4 26.4 34.8 27.6L31.4 28.6L34.4 30C33.4 32 30.6 33.8 26.6 34.6C21.6 35.6 16.6 35 13.6 33.8"
        />
        <path strokeWidth="1.8" d="M20.2 20.2C23.4 23.6 23.6 30.4 20.6 34.6" />
        <circle strokeWidth="1.6" cx="27.6" cy="25.2" r="2.4" />
        <circle cx="28" cy="25.2" r="1" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

// Rarity, each with its own colours: legendary gold, epic purple, common the site's green.
type Tier = 'legendary' | 'epic' | 'common'
const TIERS: Tier[] = ['legendary', 'epic', 'common']
const TIER_STYLE: Record<Tier, { card: string; medal: string; chip: string }> = {
  legendary: {
    card: 'border-amber-200 from-amber-50 dark:border-amber-400/30 dark:from-amber-400/10',
    medal:
      'from-amber-300 via-amber-500 to-yellow-700 ring-amber-100 dark:ring-amber-400/25',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
  },
  epic: {
    card: 'border-violet-200 from-violet-50 dark:border-violet-400/30 dark:from-violet-400/10',
    medal: 'from-violet-400 via-purple-500 to-purple-800 ring-violet-100 dark:ring-violet-400/25',
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200',
  },
  common: {
    card: 'border-brand-100 from-brand-50 dark:border-brand-700/40 dark:from-brand-700/15',
    medal: 'from-brand-600 to-brand-700 ring-brand-100 dark:ring-brand-700/40',
    chip: 'bg-brand-100 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100',
  },
}

const BADGE_META: Record<BadgeKey, { icon: ComponentType<{ className?: string }>; tier: Tier }> = {
  lead_reader: { icon: YuguoIcon, tier: 'legendary' },
}

// The badges the user holds (opened from the account menu), rarest first. Badges are given with
// one-time codes (CORAL-XXXX-XXXX), redeemed here; some also allow something, e.g. 「鱼果」
// adds works to the literature tool.
export function Badges() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const badges = useMyBadges()
  const [redeeming, setRedeeming] = useState(false)
  const [code, setCode] = useState('')
  const [fresh, setFresh] = useState<string | null>(null) // just redeemed: shown with a flourish
  const shown = (badges.data ?? [])
    .filter((b): b is typeof b & { key: BadgeKey } => b.key in BADGE_META)
    .sort((a, b) => TIERS.indexOf(BADGE_META[a.key].tier) - TIERS.indexOf(BADGE_META[b.key].tier))

  const redeem = useMutation({
    mutationFn: () => redeemBadgeCode(code),
    onSuccess: (all) => {
      const before = new Set((badges.data ?? []).map((b) => b.key))
      const added = all.find((b) => !before.has(b.key))
      queryClient.setQueryData(MY_BADGES_KEY, all)
      setRedeeming(false)
      setCode('')
      if (added && added.key in BADGE_META) {
        setFresh(added.key)
        toast.success(
          t('profile.badgeRedeemed', { name: t(`profile.badges.${added.key as BadgeKey}.name`) }),
        )
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (code.trim() && !redeem.isPending) redeem.mutate()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-100 text-brand-700">
          <Award className="size-6" />
        </span>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('profile.badgeWall')}</h1>
          <p className="text-muted-foreground">{t('profile.badgeWallHint')}</p>
        </div>
        {!redeeming && (
          <Button variant="outline" className="ml-auto" onClick={() => setRedeeming(true)}>
            <Ticket className="size-4" />
            {t('profile.redeemBadge')}
          </Button>
        )}
      </header>

      {redeeming && (
        <Card className="animate-in duration-200 fade-in slide-in-from-top-1">
          <CardContent>
            <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Escape' && setRedeeming(false)}
                placeholder={t('profile.redeemPlaceholder')}
                aria-label={t('profile.redeemBadge')}
                maxLength={20}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="w-52 font-mono tracking-wider"
              />
              <Button type="submit" disabled={!code.trim() || redeem.isPending}>
                {redeem.isPending ? '…' : t('profile.redeemSubmit')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRedeeming(false)}>
                {t('common.cancel')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {badges.isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : badges.isError ? (
        <p className="text-destructive">
          {badges.error instanceof Error ? badges.error.message : t('common.error')}
        </p>
      ) : shown.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((b) => {
            const { icon: Icon, tier } = BADGE_META[b.key]
            const style = TIER_STYLE[tier]
            return (
              <li
                key={b.key}
                className={cn(
                  'relative flex flex-col items-center gap-3 rounded-2xl border bg-gradient-to-b to-card px-5 pt-8 pb-6 text-center',
                  style.card,
                  fresh === b.key && 'animate-in duration-500 fade-in zoom-in-90',
                )}
              >
                <span
                  className={cn(
                    'absolute top-3 right-3 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    style.chip,
                  )}
                >
                  {t(`profile.tiers.${tier}`)}
                </span>
                <span
                  className={cn(
                    'grid size-20 place-items-center rounded-full bg-gradient-to-br text-white shadow-sm ring-4',
                    style.medal,
                  )}
                >
                  <Icon className="size-12" />
                </span>
                <div className="space-y-1">
                  <p className="text-lg font-semibold">{t(`profile.badges.${b.key}.name`)}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(`profile.badges.${b.key}.desc`)}
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    {t('profile.badgeGranted', {
                      date: new Date(b.granted_at).toLocaleDateString(i18n.language),
                    })}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
          {t('profile.badgeWallEmpty')}
        </div>
      )}
    </div>
  )
}

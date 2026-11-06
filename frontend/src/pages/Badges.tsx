import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Award, Check, ChevronRight, Lock, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  getBadgeProgress,
  MY_BADGES_KEY,
  MY_PROFILE_KEY,
  redeemBadgeCode,
  useMyBadges,
  useMyProfile,
  wearBadge,
  type BadgeKey,
} from '@/api/profile'
import { BeeIcon } from '@/components/BadgeIcons'
import { BADGE_META, BEE_STAGES, isBeeStage, TIERS, TIER_STYLE } from '@/lib/badges'
import { cn } from '@/lib/utils'

// 「雷蜂」's evolution under its card: a bar towards the next stage and the four stages, the ones
// reached in their colours. `current` is the highest stage held, null before the first.
function BeeEvolution({ helped, current }: { helped?: number; current: BadgeKey | null }) {
  const { t } = useTranslation()
  const at = BEE_STAGES.findIndex((s) => s.key === current)
  const next = BEE_STAGES[at + 1]
  const count = helped ?? 0
  const width = next ? Math.min(100, (count / next.need) * 100) : 100
  const nextName = next && t(`profile.badges.${next.key}.name`)
  return (
    <div className="w-full space-y-2 border-t border-border/60 pt-3 text-left">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>{t('profile.beeProgress')}</span>
        {next && (
          <span className="text-muted-foreground tabular-nums">
            {helped ?? '…'} / {next.need}
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full bg-gradient-to-r transition-[width] duration-700',
            TIER_STYLE[BADGE_META[next?.key ?? 'bee_100'].tier].medal,
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {!next
          ? t('profile.beeMax')
          : t(at < 0 ? 'profile.beeEarn' : 'profile.beeNext', {
              count: Math.max(0, next.need - count),
              name: nextName,
            })}
      </p>
      <ol className="flex flex-wrap items-center gap-1">
        {BEE_STAGES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 text-muted-foreground/60" />}
            <span
              className={cn(
                'rounded-full border px-1.5 py-px text-[11px] leading-4 font-semibold',
                i <= at
                  ? TIER_STYLE[BADGE_META[s.key].tier].tag
                  : 'border-dashed border-border text-muted-foreground/70',
              )}
            >
              {t(`profile.badges.${s.key}.name`)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// The badges the user holds (opened from the account menu), rarest first. Badges are given with
// one-time codes (CORAL-XXXX-XXXX), redeemed here; some also allow something, e.g. 「鱼果」
// adds works to the literature tool. Clicking one wears it after the user's name across the site;
// clicking the worn one takes it off. 「雷蜂」 shows as one card at its highest stage, with its
// evolution; before the first stage it shows locked, so everyone sees how to earn it.
export function Badges() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const badges = useMyBadges()
  const worn = useMyProfile().data?.worn_badge ?? null
  const [redeeming, setRedeeming] = useState(false)
  const [code, setCode] = useState('')
  const [fresh, setFresh] = useState<string | null>(null) // just redeemed: shown with a flourish
  const progress = useQuery({ queryKey: ['badge-progress'], queryFn: getBadgeProgress })
  const held = (badges.data ?? []).filter(
    (b): b is typeof b & { key: BadgeKey } => b.key in BADGE_META,
  )
  const topBee =
    [...BEE_STAGES].reverse().find((s) => held.some((b) => b.key === s.key))?.key ?? null
  const shown = held
    .filter((b) => !isBeeStage(b.key) || b.key === topBee)
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
  const wear = useMutation({
    mutationFn: wearBadge,
    onSuccess: (profile, badge) => {
      queryClient.setQueryData(MY_PROFILE_KEY, profile)
      // Names already on screen carry the old badge; fetch them again.
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== MY_PROFILE_KEY[0] && q.queryKey[0] !== MY_BADGES_KEY[0],
      })
      toast.success(
        badge
          ? t('profile.badgeWorn', { name: t(`profile.badges.${badge}.name`) })
          : t('profile.badgeTakenOff'),
      )
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
      ) : (
        <div className="space-y-3">
          {shown.length > 0 && (
            <p className="text-sm text-muted-foreground">{t('profile.badgeWearHint')}</p>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((b) => {
              const { icon: Icon, tier } = BADGE_META[b.key]
              const style = TIER_STYLE[tier]
              const isWorn = worn === b.key
              const name = t(`profile.badges.${b.key}.name`)
              return (
                <li key={b.key}>
                  <button
                    type="button"
                    disabled={wear.isPending}
                    onClick={() => wear.mutate(isWorn ? null : b.key)}
                    aria-pressed={isWorn}
                    aria-label={t(isWorn ? 'profile.takeOffBadge' : 'profile.wearBadge', { name })}
                    className={cn(
                      'relative flex h-full w-full flex-col items-center gap-3 rounded-2xl border bg-gradient-to-b to-card px-5 pt-8 pb-6 text-center transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait',
                      style.card,
                      isWorn &&
                        cn('shadow-md ring-2 ring-offset-2 ring-offset-background', style.ring),
                      fresh === b.key && 'animate-in duration-500 fade-in zoom-in-90',
                    )}
                  >
                    {isWorn && (
                      <span
                        className={cn(
                          'absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-2 ring-white/80',
                          style.wearing,
                        )}
                      >
                        <Check className="size-3" />
                        {t('profile.badgeWearing')}
                      </span>
                    )}
                    <span
                      className={cn(
                        'absolute top-3 right-3 rounded-full px-2.5 py-1 text-xs font-semibold',
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
                      <Icon className="size-14" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold">{name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t(`profile.badges.${b.key}.desc`)}
                      </p>
                      <p className="text-xs text-muted-foreground/80">
                        {t('profile.badgeGranted', {
                          date: new Date(b.granted_at).toLocaleDateString(i18n.language),
                        })}
                      </p>
                    </div>
                    {isBeeStage(b.key) && (
                      <BeeEvolution helped={progress.data?.helped_requests} current={b.key} />
                    )}
                  </button>
                </li>
              )
            })}
            {!topBee && (
              // Not earned yet: greyed, and not wearable.
              <li>
                <div
                  title={t('profile.beeLockedHint')}
                  className="relative flex h-full w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-5 pt-8 pb-6 text-center"
                >
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    <Lock className="size-3" />
                  </span>
                  <span
                    className={cn(
                      'absolute top-3 right-3 rounded-full px-2.5 py-1 text-xs font-semibold',
                      TIER_STYLE.common.chip,
                    )}
                  >
                    {t('profile.tiers.common')}
                  </span>
                  <span className="grid size-20 place-items-center rounded-full bg-gradient-to-br from-zinc-300 to-zinc-400 text-white ring-4 ring-zinc-100">
                    <BeeIcon className="size-14" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-muted-foreground">
                      {t('profile.badges.bee_10.name')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('profile.beeLocked', { need: BEE_STAGES[0].need })}
                    </p>
                  </div>
                  <BeeEvolution helped={progress.data?.helped_requests} current={null} />
                </div>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

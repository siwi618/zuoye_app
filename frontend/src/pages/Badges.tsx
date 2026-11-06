import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Award, BookMarked, Ticket, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MY_BADGES_KEY, redeemBadgeCode, useMyBadges, type BadgeKey } from '@/api/profile'
import { cn } from '@/lib/utils'

const BADGE_ICONS: Record<BadgeKey, LucideIcon> = {
  lead_reader: BookMarked,
}

// The badges the user holds (opened from the account menu). Badges are given with one-time
// codes (CORAL-XXXX-XXXX), redeemed here; some also allow something, e.g. 「领读人」 adds works
// to the literature tool.
export function Badges() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const badges = useMyBadges()
  const [redeeming, setRedeeming] = useState(false)
  const [code, setCode] = useState('')
  const [fresh, setFresh] = useState<string | null>(null) // just redeemed: shown with a flourish
  const shown = (badges.data ?? []).filter(
    (b): b is typeof b & { key: BadgeKey } => b.key in BADGE_ICONS,
  )

  const redeem = useMutation({
    mutationFn: () => redeemBadgeCode(code),
    onSuccess: (all) => {
      const before = new Set((badges.data ?? []).map((b) => b.key))
      const added = all.find((b) => !before.has(b.key))
      queryClient.setQueryData(MY_BADGES_KEY, all)
      setRedeeming(false)
      setCode('')
      if (added && added.key in BADGE_ICONS) {
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
            const Icon = BADGE_ICONS[b.key]
            return (
              <li
                key={b.key}
                className={cn(
                  'flex flex-col items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-card px-5 py-6 text-center dark:border-brand-700/40 dark:from-brand-700/15',
                  fresh === b.key && 'animate-in duration-500 fade-in zoom-in-90',
                )}
              >
                <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-sm ring-4 ring-brand-100 dark:ring-brand-700/40">
                  <Icon className="size-7" />
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

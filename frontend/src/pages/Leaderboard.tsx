import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Crown, Star, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StarRating } from '@/components/StarRating'
import {
  getLeaderboard,
  getMyStanding,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '@/api/feedback'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { BadgeTag } from '@/components/BadgeTag'

const podiumStyles: Record<number, { ring: string; bg: string; badge: string; rankText: string }> =
  {
    0: {
      ring: 'ring-amber-300',
      bg: 'bg-gradient-to-br from-amber-50 to-amber-100/60',
      badge: 'bg-amber-500 text-white',
      rankText: 'text-amber-700',
    },
    1: {
      ring: 'ring-slate-300',
      bg: 'bg-gradient-to-br from-slate-50 to-slate-100/60',
      badge: 'bg-slate-400 text-white',
      rankText: 'text-slate-700',
    },
    2: {
      ring: 'ring-orange-300',
      bg: 'bg-gradient-to-br from-orange-50 to-orange-100/60',
      badge: 'bg-orange-400 text-white',
      rankText: 'text-orange-700',
    },
  }

// The weighted score, with the real average and count of valid reviews under it. On a phone
// one star stands in for the five, which would squeeze the name.
function Score({ entry }: { entry: Pick<LeaderboardEntry, 'score' | 'avg_rating'> }) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <span className="flex items-center gap-1.5">
        <Star className="size-3.5 fill-amber-400 text-amber-400 sm:hidden" />
        <span className="text-sm font-semibold tabular-nums">{entry.score.toFixed(2)}</span>
        <span className="hidden sm:inline-flex">
          <StarRating value={entry.avg_rating} size="sm" />
        </span>
      </span>
      <span className="text-[11px] text-muted-foreground">{t('leaderboard.score')}</span>
    </div>
  )
}

// Ranked by a weighted score (migration 0029): everyone counts as also having a few imaginary
// reviews at the site's typical rating, learnt from all ratings, so a couple of 5-star reviews
// can't beat many good ones; only valid reviews count, and 3 are needed to be ranked. All time or
// this month; below the top 10, where you stand.
export function Leaderboard() {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.user?.id)
  const [period, setPeriod] = useState<LeaderboardPeriod>('all')
  const query = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => getLeaderboard(10, period),
  })
  const standing = useQuery({
    queryKey: ['leaderboard-me', period],
    queryFn: () => getMyStanding(period),
  })
  const me = standing.data
  const shownMe = !!me?.rank && (query.data ?? []).some((e) => e.user.id === userId)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex items-center gap-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-soft">
          <Trophy className="size-6" />
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('leaderboard.title')}</h1>
          <p className="text-muted-foreground">{t('leaderboard.subtitle')}</p>
        </div>
      </header>

      <Card>
        <CardHeader className="space-y-2 border-b border-border/60 pb-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Top 10</CardTitle>
            <div className="flex gap-1 rounded-full bg-secondary p-1">
              {(['all', 'month'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={period === value}
                  onClick={() => setPeriod(value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    period === value
                      ? 'bg-card text-foreground shadow-soft'
                      : 'text-muted-foreground',
                  )}
                >
                  {t(`leaderboard.period_${value}`)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t('leaderboard.howRanked', { min: me?.min_reviews ?? 3 })}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          {query.isLoading ? (
            <p className="py-6 text-muted-foreground">{t('common.loading')}</p>
          ) : query.isError ? (
            <p className="py-6 text-destructive">
              {query.error instanceof Error ? query.error.message : t('common.error')}
            </p>
          ) : (query.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-muted-foreground">
              {t(period === 'month' ? 'leaderboard.emptyMonth' : 'leaderboard.empty')}
            </p>
          ) : (
            <ol className="divide-y divide-border/60">
              {query.data!.map((entry, idx) => {
                const initials = entry.user.display_name.slice(0, 2).toUpperCase()
                const podium = podiumStyles[idx]
                const mine = entry.user.id === userId
                return (
                  <li
                    key={entry.user.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-3 transition-colors sm:gap-4',
                      podium ? podium.bg : 'hover:bg-secondary/60',
                      mine && 'ring-2 ring-primary/40',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        podium ? podium.badge : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {idx === 0 ? <Crown className="size-3.5" /> : entry.rank}
                    </span>
                    <Avatar
                      className={cn(
                        'size-9 shrink-0 sm:size-10',
                        podium && `ring-2 ${podium.ring} ring-offset-2 ring-offset-background`,
                      )}
                    >
                      <AvatarFallback className="bg-brand-100 font-semibold text-brand-700">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      {/* On a narrow row the badge wraps under the name instead of hiding it. */}
                      <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span
                          className={cn(
                            'max-w-full font-medium truncate',
                            podium && podium.rankText,
                          )}
                        >
                          {entry.user.display_name}
                        </span>
                        <BadgeTag badge={entry.user.worn_badge} />
                      </p>
                      <p className="text-xs break-keep text-muted-foreground">
                        {t('leaderboard.avgAndCount', {
                          avg: entry.avg_rating.toFixed(2),
                          count: entry.feedback_count,
                        })}
                      </p>
                    </div>
                    <Score entry={entry} />
                  </li>
                )
              })}
            </ol>
          )}
          {me && !shownMe && (
            // Where you stand when you're not in the top 10, or what it takes to be ranked.
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-3 text-sm">
              <span className="shrink-0 font-semibold text-primary">{t('leaderboard.you')}</span>
              {me.rank && me.score != null && me.avg_rating != null ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {t('leaderboard.youRank', { rank: me.rank })}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('leaderboard.avgAndCount', {
                        avg: me.avg_rating.toFixed(2),
                        count: me.feedback_count,
                      })}
                    </span>
                  </span>
                  <Score entry={{ score: me.score, avg_rating: me.avg_rating }} />
                </>
              ) : (
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {t('leaderboard.youNeed', { count: me.needed })}
                </span>
              )}
            </div>
          )}
          <p className="text-[11px] leading-4 text-muted-foreground/80">
            {t('leaderboard.validRule')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

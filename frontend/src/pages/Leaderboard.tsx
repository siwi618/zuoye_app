import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Crown, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StarRating } from '@/components/StarRating'
import { getLeaderboard } from '@/api/feedback'
import { cn } from '@/lib/utils'

const podiumStyles: Record<number, { ring: string; bg: string; badge: string; rankText: string }> = {
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

export function Leaderboard() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => getLeaderboard(10),
  })

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
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base">Top 10</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {query.isLoading ? (
            <p className="py-6 text-muted-foreground">{t('common.loading')}</p>
          ) : query.isError ? (
            <p className="py-6 text-destructive">
              {query.error instanceof Error ? query.error.message : t('common.error')}
            </p>
          ) : (query.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-muted-foreground">{t('leaderboard.empty')}</p>
          ) : (
            <ol className="divide-y divide-border/60">
              {query.data!.map((entry, idx) => {
                const initials = entry.user.display_name.slice(0, 2).toUpperCase()
                const podium = podiumStyles[idx]
                return (
                  <li
                    key={entry.user.id}
                    className={cn(
                      'flex items-center gap-4 rounded-xl px-3 py-3 transition-colors',
                      podium ? podium.bg : 'hover:bg-secondary/60',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold',
                        podium ? podium.badge : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {idx === 0 ? <Crown className="size-3.5" /> : idx + 1}
                    </span>
                    <Avatar className={cn('size-10', podium && `ring-2 ${podium.ring} ring-offset-2 ring-offset-background`)}>
                      <AvatarFallback className="bg-brand-100 font-semibold text-brand-700">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium truncate', podium && podium.rankText)}>
                        {entry.user.display_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.feedback_count} {t('leaderboard.reviews')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {entry.avg_rating.toFixed(2)}
                      </span>
                      <StarRating value={entry.avg_rating} size="sm" />
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

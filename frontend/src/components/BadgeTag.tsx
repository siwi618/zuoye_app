import { useTranslation } from 'react-i18next'
import { BADGE_META, isBadgeKey, TIER_STYLE } from '@/lib/badges'
import { cn } from '@/lib/utils'

// The badge a user wears, as a small tag after their name, coloured by rarity. Nothing for no
// badge or one this version of the site doesn't know.
export function BadgeTag({ badge, className }: { badge?: string | null; className?: string }) {
  const { t } = useTranslation()
  if (!isBadgeKey(badge)) return null
  const { icon: Icon, tier } = BADGE_META[badge]
  const name = t(`profile.badges.${badge}.name`)
  return (
    <span
      title={`${name} · ${t(`profile.tiers.${tier}`)}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px align-middle text-[11px] leading-4 font-semibold whitespace-nowrap',
        TIER_STYLE[tier].tag,
        className,
      )}
    >
      <Icon className="size-3.5" />
      {name}
    </span>
  )
}

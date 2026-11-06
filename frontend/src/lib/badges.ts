import type { ComponentType } from 'react'
import { BADGES, type BadgeKey } from '@/api/profile'
import { YuguoIcon } from '@/components/BadgeIcons'

// Rarity, each with its own colours: legendary gold, epic purple, common the site's green.
export type Tier = 'legendary' | 'epic' | 'common'
export const TIERS: Tier[] = ['legendary', 'epic', 'common']
export const TIER_STYLE: Record<
  Tier,
  { card: string; medal: string; chip: string; tag: string; ring: string; wearing: string }
> = {
  legendary: {
    card: 'border-amber-200 from-amber-50 dark:border-amber-400/30 dark:from-amber-400/10',
    medal: 'from-amber-300 via-amber-500 to-yellow-700 ring-amber-100 dark:ring-amber-400/25',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
    ring: 'ring-amber-400/70',
    wearing: 'bg-gradient-to-r from-amber-400 to-amber-600 text-white',
    tag: 'border-amber-300/80 bg-gradient-to-r from-amber-50 to-yellow-100 text-amber-700 dark:border-amber-400/40 dark:from-amber-400/15 dark:to-yellow-400/10 dark:text-amber-200',
  },
  epic: {
    card: 'border-violet-200 from-violet-50 dark:border-violet-400/30 dark:from-violet-400/10',
    medal: 'from-violet-400 via-purple-500 to-purple-800 ring-violet-100 dark:ring-violet-400/25',
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200',
    ring: 'ring-violet-400/70',
    wearing: 'bg-gradient-to-r from-violet-500 to-purple-600 text-white',
    tag: 'border-violet-300/80 bg-violet-50 text-violet-700 dark:border-violet-400/40 dark:bg-violet-400/15 dark:text-violet-200',
  },
  common: {
    card: 'border-brand-100 from-brand-50 dark:border-brand-700/40 dark:from-brand-700/15',
    medal: 'from-brand-600 to-brand-700 ring-brand-100 dark:ring-brand-700/40',
    chip: 'bg-brand-100 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100',
    ring: 'ring-brand-500/60',
    wearing: 'bg-primary text-primary-foreground',
    tag: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-700/50 dark:bg-brand-700/20 dark:text-brand-100',
  },
}

export const BADGE_META: Record<
  BadgeKey,
  { icon: ComponentType<{ className?: string }>; tier: Tier }
> = {
  lead_reader: { icon: YuguoIcon, tier: 'legendary' },
}

export function isBadgeKey(key: string | null | undefined): key is BadgeKey {
  return !!key && (BADGES as readonly string[]).includes(key)
}

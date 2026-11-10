import type { ComponentType } from 'react'
import { BADGES, type BadgeKey, type BadgeProgress } from '@/api/profile'
import {
  BeeIcon,
  CrownIcon,
  DomeCrownIcon,
  LaurelIcon,
  QuoterIcon,
  WriterIcon,
  YuguoIcon,
} from '@/components/BadgeIcons'

// Rarity, each with its own colours: mythic deep crimson, legendary gold, epic purple, common the
// site's green.
export type Tier = 'mythic' | 'legendary' | 'epic' | 'common'
export const TIERS: Tier[] = ['mythic', 'legendary', 'epic', 'common']
export const TIER_STYLE: Record<
  Tier,
  { card: string; medal: string; chip: string; tag: string; ring: string; wearing: string }
> = {
  mythic: {
    card: 'border-red-300 from-red-50 dark:border-red-500/40 dark:from-red-500/10',
    medal: 'from-red-500 via-red-700 to-rose-950 ring-red-100 dark:ring-red-500/25',
    chip: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200',
    ring: 'ring-red-600/60',
    wearing: 'bg-gradient-to-r from-red-600 to-rose-900 text-white',
    tag: 'border-red-300/80 bg-gradient-to-r from-red-50 to-rose-100 text-red-800 dark:border-red-500/40 dark:from-red-500/15 dark:to-rose-500/10 dark:text-red-200',
  },
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
  bee_10: { icon: BeeIcon, tier: 'common' },
  bee_25: { icon: BeeIcon, tier: 'epic' },
  bee_50: { icon: BeeIcon, tier: 'legendary' },
  bee_100: { icon: BeeIcon, tier: 'mythic' },
  writer_5: { icon: WriterIcon, tier: 'common' },
  writer_15: { icon: WriterIcon, tier: 'epic' },
  writer_30: { icon: WriterIcon, tier: 'legendary' },
  writer_50: { icon: WriterIcon, tier: 'mythic' },
  quoter_3: { icon: QuoterIcon, tier: 'common' },
  quoter_10: { icon: QuoterIcon, tier: 'epic' },
  quoter_25: { icon: QuoterIcon, tier: 'legendary' },
  quoter_50: { icon: QuoterIcon, tier: 'mythic' },
  month_champion: { icon: LaurelIcon, tier: 'epic' },
  all_time_top: { icon: CrownIcon, tier: 'mythic' },
  modern_top: { icon: DomeCrownIcon, tier: 'mythic' },
}

// Badges anyone can earn that don't evolve: shown locked (「？？？」) until held, with how to earn
// them. 「月度冠军」: first on a month's leaderboard, settled on the 1st (migration 0030).
// 「史上最强」: first on the all-time leaderboard, held only while first (migration 0031).
// 「现代最强」: the most 「月度冠军」 wins, held only while no one has more (migration 0032).
export const OPEN_BADGES: readonly BadgeKey[] = ['all_time_top', 'modern_top', 'month_champion']

// Badges that don't evolve; each has its own description (profile.badgeDesc), while an evolving
// badge's family shares one (profile.evolution.<family>.desc).
export type OneTimeBadge = 'lead_reader' | 'month_champion' | 'all_time_top' | 'modern_top'

// Badges that evolve: each stage is its own badge, granted by the database as a count grows —
// 「雷蜂」 with requests helped complete (migration 0026), 「鲷苗人」 with literature analyses
// (migration 0028), 「钳书童」 with literature quotes cited by others (migration 0033). The badge
// wall shows only the highest stage held, with its progress.
export type EvolutionFamily = 'bee' | 'writer' | 'quoter'
export interface Evolution {
  family: EvolutionFamily
  count: keyof BadgeProgress
  stages: readonly { key: BadgeKey; need: number }[]
}

export const EVOLUTIONS: readonly Evolution[] = [
  {
    family: 'bee',
    count: 'helped_requests',
    stages: [
      { key: 'bee_10', need: 10 },
      { key: 'bee_25', need: 25 },
      { key: 'bee_50', need: 50 },
      { key: 'bee_100', need: 100 },
    ],
  },
  {
    family: 'writer',
    count: 'counted_analyses',
    stages: [
      { key: 'writer_5', need: 5 },
      { key: 'writer_15', need: 15 },
      { key: 'writer_30', need: 30 },
      { key: 'writer_50', need: 50 },
    ],
  },
  {
    family: 'quoter',
    count: 'counted_quotes',
    stages: [
      { key: 'quoter_3', need: 3 },
      { key: 'quoter_10', need: 10 },
      { key: 'quoter_25', need: 25 },
      { key: 'quoter_50', need: 50 },
    ],
  },
]

export function evolutionOf(key: string): Evolution | undefined {
  return EVOLUTIONS.find((e) => e.stages.some((s) => s.key === key))
}

export function isBadgeKey(key: string | null | undefined): key is BadgeKey {
  return !!key && (BADGES as readonly string[]).includes(key)
}

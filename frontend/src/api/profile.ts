import { useQuery } from '@tanstack/react-query'
import { GRADE_OPTIONS } from '@/lib/constants'
import { apiFetch } from './client'

export type Grade = (typeof GRADE_OPTIONS)[number]

export interface MyProfile {
  // Default grade for new requests; null until confirmed on the profile page.
  grade: Grade | null
  display_name: string
  // When the next rename is allowed (one per 30 days); null = allowed now.
  next_name_change_at: string | null
  // The badge worn after the name, if any.
  worn_badge?: string | null
  // When the badge wall was last opened; badges granted after it are new.
  badges_seen_at?: string | null
}

export function getMyProfile(): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me/profile')
}

export function updateMyProfile(payload: { grade: Grade | null }): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function changeMyName(displayName: string): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me/name', {
    method: 'PUT',
    body: JSON.stringify({ display_name: displayName }),
  })
}

export const MY_PROFILE_KEY = ['my-profile'] as const

export function useMyProfile() {
  return useQuery({ queryKey: MY_PROFILE_KEY, queryFn: getMyProfile, staleTime: 5 * 60_000 })
}

// Keep in sync with the badges table (migration 0023) and profile.badges.* in the translations.
export const BADGES = [
  'lead_reader',
  'bee_10',
  'bee_25',
  'bee_50',
  'bee_100',
  'writer_5',
  'writer_15',
  'writer_30',
  'writer_50',
  'month_champion',
  'all_time_top',
  'modern_top',
] as const
export type BadgeKey = (typeof BADGES)[number]
// 「鱼果」 (the key predates the name): may add works to the literature tool.
export const LEAD_READER: BadgeKey = 'lead_reader'

export interface Badge {
  key: string
  granted_at: string // for 「月度冠军」, the latest win
  // 「月度冠军」 only: months won, and the latest one (its first day, YYYY-MM-DD).
  times?: number | null
  last_month?: string | null
}

export function listMyBadges(): Promise<Badge[]> {
  return apiFetch<Badge[]>('/me/badges')
}

// Redeems a one-time code (CORAL-XXXX-XXXX); returns all the caller's badges.
export function redeemBadgeCode(code: string): Promise<Badge[]> {
  return apiFetch<Badge[]>('/me/badges/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

// Wears one of the caller's badges after their name, or takes it off (null).
export function wearBadge(badge: BadgeKey | null): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me/badges/worn', {
    method: 'PUT',
    body: JSON.stringify({ badge }),
  })
}

// Counts behind the evolving badges: 「雷蜂」 (requests helped complete) and 「鲷苗人」 (literature
// analyses that count).
export interface BadgeProgress {
  helped_requests: number
  counted_analyses: number
}

export function getBadgeProgress(): Promise<BadgeProgress> {
  return apiFetch<BadgeProgress>('/me/badges/progress')
}

export const MY_BADGES_KEY = ['my-badges'] as const

export function useMyBadges() {
  return useQuery({ queryKey: MY_BADGES_KEY, queryFn: listMyBadges, staleTime: 5 * 60_000 })
}

// The badge wall was opened: what's held so far is no longer new.
export function markBadgesSeen(): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me/badges/seen', { method: 'POST' })
}

// Badges granted after `seenAt` (all of them when it's null), only the ones this site knows.
export function newBadgeKeys(badges: Badge[] | undefined, seenAt: string | null | undefined) {
  const since = seenAt ? Date.parse(seenAt) : -Infinity
  return (badges ?? [])
    .filter(
      (b) => (BADGES as readonly string[]).includes(b.key) && Date.parse(b.granted_at) > since,
    )
    .map((b) => b.key as BadgeKey)
}

// A red dot on the avatar and the badge wall's menu item until the wall is opened.
export function useHasNewBadges(): boolean {
  const badges = useMyBadges().data
  const profile = useMyProfile().data
  return !!profile && newBadgeKeys(badges, profile.badges_seen_at).length > 0
}

export function useHasBadge(badge: BadgeKey): boolean {
  return useMyBadges().data?.some((b) => b.key === badge) ?? false
}

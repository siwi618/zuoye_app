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
export const BADGES = ['lead_reader'] as const
export type BadgeKey = (typeof BADGES)[number]
// 「鱼果」 (the key predates the name): may add works to the literature tool.
export const LEAD_READER: BadgeKey = 'lead_reader'

export interface Badge {
  key: string
  granted_at: string
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

export const MY_BADGES_KEY = ['my-badges'] as const

export function useMyBadges() {
  return useQuery({ queryKey: MY_BADGES_KEY, queryFn: listMyBadges, staleTime: 5 * 60_000 })
}

export function useHasBadge(badge: BadgeKey): boolean {
  return useMyBadges().data?.some((b) => b.key === badge) ?? false
}

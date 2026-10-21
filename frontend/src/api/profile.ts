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

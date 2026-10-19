import { useQuery } from '@tanstack/react-query'
import { GRADE_OPTIONS } from '@/lib/constants'
import { apiFetch } from './client'

export type Grade = (typeof GRADE_OPTIONS)[number]

export interface MyProfile {
  // Default grade for new requests; null until confirmed on the profile page.
  grade: Grade | null
}

export function getMyProfile(): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me/profile')
}

export function updateMyProfile(payload: MyProfile): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export const MY_PROFILE_KEY = ['my-profile'] as const

export function useMyProfile() {
  return useQuery({ queryKey: MY_PROFILE_KEY, queryFn: getMyProfile, staleTime: 5 * 60_000 })
}

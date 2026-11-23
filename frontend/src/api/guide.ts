import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { GuideActivity, CustomStart } from '@/lib/guide/scene'

// What the backend stores for an event's map (title and subtitle are separate columns).
export interface GuideEventConfig {
  start: string | CustomStart | null
  sign: string
  activities: GuideActivity[]
}

export interface GuideEventSummary {
  id: string
  title: string
  subtitle: string
  activity_count: number
  updated_at: string
  open_from: string | null // Beijing dates (YYYY-MM-DD) on which everyone may see it
  open_to: string | null
}

export interface GuideEvent {
  id: string
  title: string
  subtitle: string
  config: GuideEventConfig
  updated_at: string
  open_from: string | null
  open_to: string | null
  can_edit: boolean // anyone on the student council
  can_manage: boolean // the president or vice president: may also create and delete
}

export interface GuideEventWrite {
  title: string
  subtitle: string
  config: GuideEventConfig
  open_from: string | null
  open_to: string | null
}

export type CouncilRole = 'president' | 'vice' | 'member'

export interface CouncilPerson {
  id: string
  display_name: string
  grade: string | null
}

export interface CouncilCode {
  code: string // CORAL-XXXX-XXXX
  expires_at: string
}

// The caller's place on the student council (migration 0034), with the vice and the members; the
// president also gets their 传承码 and 副会长码.
export interface CouncilStatus {
  role: CouncilRole | null
  term: number | null
  started_at: string | null
  expires_at: string | null // the president's badge runs out
  handover_from: string | null // the president may make a 传承码 from then
  president_code: CouncilCode | null
  vice_code: CouncilCode | null
  vice: CouncilPerson | null
  members: CouncilPerson[]
}

export const GUIDE_EVENTS_KEY = ['guide-events'] as const
export const guideEventKey = (id: string) => ['guide-event', id] as const
export const COUNCIL_KEY = ['guide-council'] as const

// Every event for the student council; for everyone else only those open today.
export function listGuideEvents(): Promise<GuideEventSummary[]> {
  return apiFetch<GuideEventSummary[]>('/guide/events')
}

export function getGuideEvent(id: string): Promise<GuideEvent> {
  return apiFetch<GuideEvent>(`/guide/events/${id}`)
}

export function createGuideEvent(body: GuideEventWrite): Promise<GuideEvent> {
  return apiFetch<GuideEvent>('/guide/events', { method: 'POST', body: JSON.stringify(body) })
}

export function updateGuideEvent(id: string, body: GuideEventWrite): Promise<GuideEvent> {
  return apiFetch<GuideEvent>(`/guide/events/${id}`, { method: 'PUT', body: JSON.stringify(body) })
}

export function deleteGuideEvent(id: string): Promise<void> {
  return apiFetch<void>(`/guide/events/${id}`, { method: 'DELETE' })
}

export function useGuideEvents(enabled = true) {
  return useQuery({ queryKey: GUIDE_EVENTS_KEY, queryFn: listGuideEvents, enabled })
}

export function useGuideEvent(id: string) {
  return useQuery({ queryKey: guideEventKey(id), queryFn: () => getGuideEvent(id), retry: false })
}

export function getCouncil(): Promise<CouncilStatus> {
  return apiFetch<CouncilStatus>('/guide/council')
}

// Also decides whether the 学生会 page shows in the navigation.
export function useCouncil(enabled = true) {
  return useQuery({ queryKey: COUNCIL_KEY, queryFn: getCouncil, enabled, staleTime: 5 * 60_000 })
}

// The president's codes: 传承码 (president) and 副会长码 (vice).
export type CodeRole = 'president' | 'vice'

// Makes a code, cancelling the unused one of that kind.
export function newCouncilCode(role: CodeRole): Promise<CouncilStatus> {
  return apiFetch<CouncilStatus>('/guide/council/codes', {
    method: 'POST',
    body: JSON.stringify({ role }),
  })
}

export function revokeCouncilCode(role: CodeRole): Promise<CouncilStatus> {
  return apiFetch<CouncilStatus>(`/guide/council/codes/${role}`, { method: 'DELETE' })
}

export function removeVice(): Promise<CouncilStatus> {
  return apiFetch<CouncilStatus>('/guide/council/vice', { method: 'DELETE' })
}

// A member leaves the council (members stay across terms until they leave or are removed).
export function leaveCouncil(): Promise<CouncilStatus> {
  return apiFetch<CouncilStatus>('/guide/council/leave', { method: 'POST' })
}

// The president finds people by name to add as members.
export function searchCouncilUsers(q: string): Promise<CouncilPerson[]> {
  return apiFetch<CouncilPerson[]>(`/guide/users?q=${encodeURIComponent(q)}`)
}

export function addMember(userId: string): Promise<CouncilStatus> {
  return apiFetch<CouncilStatus>('/guide/council/members', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
}

export function removeMember(id: string): Promise<CouncilStatus> {
  return apiFetch<CouncilStatus>(`/guide/council/members/${id}`, { method: 'DELETE' })
}

// Today's Beijing date (YYYY-MM-DD), the calendar open days are in.
export function beijingToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
}

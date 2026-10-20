import { apiFetch } from './client'
import type { MediaRead } from './media'

export type RequestStatus = 'open' | 'accepted' | 'completed' | 'cancelled'
export type RequestMode = 'online' | 'offline' | 'either'

export interface ProfileSummary {
  id: string
  display_name: string
  avatar_url: string | null
}

export interface RequestRead {
  id: string
  requester: ProfileSummary
  helper: ProfileSummary | null
  grade: string
  subject: string
  topic: string | null
  description: string
  media: MediaRead[]
  mode: RequestMode
  status: RequestStatus
  scheduled_at: string | null
  meeting_info: string | null
  created_at: string
  accepted_at: string | null
  completed_at: string | null
}

export interface RequestCreate {
  grade: string
  subject: string
  topic?: string | null
  description: string
  mode: RequestMode
  media_ids?: string[]
}

export interface ListRequestsParams {
  status?: RequestStatus
  subject?: string
  grade?: string
  mine?: boolean
  exclude_mine?: boolean
  helping?: boolean  // only requests the caller accepted as helper
  posted?: boolean  // only requests the caller posted
  hide_cancelled?: boolean
  limit?: number
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export function listRequests(params: ListRequestsParams = {}): Promise<RequestRead[]> {
  return apiFetch<RequestRead[]>(`/requests${qs({ ...params })}`)
}

export function getRequest(id: string): Promise<RequestRead> {
  return apiFetch<RequestRead>(`/requests/${id}`)
}

export function createRequest(payload: RequestCreate): Promise<RequestRead> {
  return apiFetch<RequestRead>('/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function cancelRequest(id: string): Promise<RequestRead> {
  return apiFetch<RequestRead>(`/requests/${id}/cancel`, { method: 'POST' })
}

// Completed requests only; hidden everywhere, but the helper keeps the rating.
export function deleteRequest(id: string): Promise<void> {
  return apiFetch<void>(`/requests/${id}`, { method: 'DELETE' })
}

export function acceptRequest(id: string): Promise<RequestRead> {
  return apiFetch<RequestRead>(`/requests/${id}/accept`, { method: 'POST' })
}

export interface ScheduleRequestPayload {
  scheduled_at: string  // ISO 8601
  meeting_info: string
}

export function scheduleRequest(id: string, payload: ScheduleRequestPayload): Promise<RequestRead> {
  return apiFetch<RequestRead>(`/requests/${id}/schedule`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function completeRequest(id: string): Promise<RequestRead> {
  return apiFetch<RequestRead>(`/requests/${id}/complete`, { method: 'POST' })
}

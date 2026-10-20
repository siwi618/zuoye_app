import { apiFetch } from './client'
import type { ProfileSummary } from './requests'

export interface MessageRead {
  id: string
  request_id: string
  sender: ProfileSummary
  body: string
  created_at: string
}

export function listMessages(requestId: string): Promise<MessageRead[]> {
  return apiFetch<MessageRead[]>(`/requests/${requestId}/messages`)
}

export function sendMessage(requestId: string, body: string): Promise<MessageRead> {
  return apiFetch<MessageRead>(`/requests/${requestId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

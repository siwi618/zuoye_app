import { apiFetch } from './client'
import type { ProfileSummary } from './requests'

export interface FeedbackRead {
  id: string
  request_id: string
  from_user: ProfileSummary
  to_user: ProfileSummary
  rating: number
  comment: string | null
  created_at: string
}

export interface FeedbackCreate {
  rating: number
  comment: string
}

export interface LeaderboardEntry {
  user: ProfileSummary
  avg_rating: number
  feedback_count: number
}

export function listFeedbacks(requestId: string): Promise<FeedbackRead[]> {
  return apiFetch<FeedbackRead[]>(`/requests/${requestId}/feedbacks`)
}

export function createFeedback(
  requestId: string,
  payload: FeedbackCreate,
): Promise<FeedbackRead> {
  return apiFetch<FeedbackRead>(`/requests/${requestId}/feedback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  return apiFetch<LeaderboardEntry[]>(`/leaderboard?limit=${limit}`)
}

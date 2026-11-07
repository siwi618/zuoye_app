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

// Ranked by `score`: the rating weighted with imaginary reviews learnt from all ratings
// (migration 0029); `avg_rating` and `feedback_count` are the real average and valid reviews.
export interface LeaderboardEntry {
  user: ProfileSummary
  avg_rating: number
  feedback_count: number
  score: number
  rank: number
}

export type LeaderboardPeriod = 'all' | 'month'

export interface LeaderboardStanding {
  rank: number | null // null while under min_reviews valid reviews
  avg_rating: number | null
  feedback_count: number
  score: number | null
  needed: number
  // Every helper counts as also having prior_weight reviews of prior_mean stars.
  prior_mean: number
  prior_weight: number
  min_reviews: number
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

export function getLeaderboard(
  limit = 10,
  period: LeaderboardPeriod = 'all',
): Promise<LeaderboardEntry[]> {
  return apiFetch<LeaderboardEntry[]>(`/leaderboard?limit=${limit}&period=${period}`)
}

export function getMyStanding(period: LeaderboardPeriod = 'all'): Promise<LeaderboardStanding> {
  return apiFetch<LeaderboardStanding>(`/leaderboard/me?period=${period}`)
}

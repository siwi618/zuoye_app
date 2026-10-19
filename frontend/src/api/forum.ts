import { apiFetch } from './client'
import type { ProfileSummary } from './requests'
import type { MediaRead } from './media'

export type PostSort = 'hot' | 'new'
export type TimeRange = 'all' | 'day' | 'week' | 'month'
export type CommentSort = 'top' | 'new'

export interface PostRead {
  id: string
  author: ProfileSummary
  title: string
  body: string
  media: MediaRead[]
  tag: string
  view_count: number
  like_count: number
  comment_count: number
  liked_by_me: boolean
  created_at: string
}

export interface PostCreate {
  title: string
  body: string
  tag: string
  media_ids?: string[]
}

export interface CommentRead {
  id: string
  post_id: string
  author: ProfileSummary
  body: string
  media: MediaRead[]
  like_count: number
  liked_by_me: boolean
  created_at: string
}

export interface LikeResult {
  liked: boolean
  like_count: number
}

export interface ListPostsParams {
  tag?: string
  sort?: PostSort
  range?: TimeRange
  limit?: number
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export function listPosts(params: ListPostsParams = {}): Promise<PostRead[]> {
  return apiFetch<PostRead[]>(`/forum/posts${qs({ ...params })}`)
}

export function getPost(id: string): Promise<PostRead> {
  return apiFetch<PostRead>(`/forum/posts/${id}`)
}

export function createPost(payload: PostCreate): Promise<PostRead> {
  return apiFetch<PostRead>('/forum/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deletePost(id: string): Promise<void> {
  return apiFetch<void>(`/forum/posts/${id}`, { method: 'DELETE' })
}

export function recordView(id: string): Promise<void> {
  return apiFetch<void>(`/forum/posts/${id}/view`, { method: 'POST' })
}

export function togglePostLike(id: string): Promise<LikeResult> {
  return apiFetch<LikeResult>(`/forum/posts/${id}/like`, { method: 'POST' })
}

export function listComments(postId: string, sort: CommentSort = 'top'): Promise<CommentRead[]> {
  return apiFetch<CommentRead[]>(`/forum/posts/${postId}/comments?sort=${sort}`)
}

export function createComment(
  postId: string,
  body: string,
  mediaIds: string[] = [],
): Promise<CommentRead> {
  return apiFetch<CommentRead>(`/forum/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, media_ids: mediaIds }),
  })
}

export function deleteComment(id: string): Promise<void> {
  return apiFetch<void>(`/forum/comments/${id}`, { method: 'DELETE' })
}

export function toggleCommentLike(id: string): Promise<LikeResult> {
  return apiFetch<LikeResult>(`/forum/comments/${id}/like`, { method: 'POST' })
}

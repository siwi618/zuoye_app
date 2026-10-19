import { apiFetch, apiUpload } from './client'

export type MediaKind = 'image' | 'video'

export interface MediaRead {
  id: string
  kind: MediaKind
  url: string
}

export interface ModerationNotice {
  id: string
  source: string
  created_at: string
}

export const MAX_ATTACHMENTS = 4
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024
export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/gif'
export const ACCEPTED_VIDEOS = 'video/mp4,video/webm,video/quicktime'

export function uploadMedia(file: File): Promise<MediaRead> {
  const form = new FormData()
  form.append('file', file)
  return apiUpload<MediaRead>('/media', form)
}

export function getMediaConfig(): Promise<{ video_enabled: boolean }> {
  return apiFetch<{ video_enabled: boolean }>('/media/config')
}

export function listNotices(): Promise<ModerationNotice[]> {
  return apiFetch<ModerationNotice[]>('/me/notices')
}

export function markNoticesSeen(): Promise<void> {
  return apiFetch<void>('/me/notices/seen', { method: 'POST' })
}

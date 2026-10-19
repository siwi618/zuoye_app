import i18n from '@/i18n'
import { useModerationAlert } from '@/store/moderationAlert'
import { supabase } from './supabase'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

// Backend error details that have a translated message.
const KNOWN_ERRORS: Record<string, string> = {
  content_rejected: 'common.contentRejected',
  file_too_large: 'media.tooLarge',
  unsupported_media_type: 'media.unsupported',
  unreadable_video: 'media.unreadable',
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function checkDisplayName(displayName: string): Promise<boolean> {
  const { allowed } = await apiFetch<{ allowed: boolean }>('/moderation/display-name', {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName }),
  })
  return allowed
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, init)

  if (!res.ok) {
    const body = await res.text()
    let detail: unknown
    try {
      detail = (JSON.parse(body) as { detail?: unknown }).detail
    } catch {
      // not JSON
    }
    if (typeof detail === 'string' && detail in KNOWN_ERRORS) {
      if (detail === 'content_rejected') useModerationAlert.getState().show()
      throw new Error(i18n.t(KNOWN_ERRORS[detail]))
    }
    throw new Error(`API ${res.status}: ${body}`)
  }

  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...((init.headers as Record<string, string>) ?? {}),
  }
  return request<T>(path, { ...init, headers })
}

// multipart/form-data upload — the browser sets the Content-Type boundary.
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: form, headers: await authHeader() })
}

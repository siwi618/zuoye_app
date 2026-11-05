import { apiFetch } from './client'
import type { ProfileSummary } from './requests'
import type { TagKind } from '@/lib/literature/text'

export interface QuoteRead {
  id: string
  work_key: string
  author: ProfileSummary
  body: string
  page_start: number
  page_end: number
  edition: string | null // edition / publisher the pages refer to
  // Analyses citing it; a cited quote can no longer be deleted.
  cited_count: number
  created_at: string
  // Who changed it last and when, once it has been edited.
  last_editor: ProfileSummary | null
  edited_at: string | null
}

export interface TagRead {
  id: string
  name: string
  kind: TagKind
  // Analyses using it: in the work asked about, or in all works.
  count: number
}

// A highlighted fragment of a covered quote, cited in the body as「(引文N)」.
// Offsets count characters (code points), not UTF-16 units.
export interface Highlight {
  quote_id: string
  number: number
  start: number
  end: number
}

// One version of a quote. An analysis cites the version it was written on, so a later change to
// the quote leaves it as written; its highlights point into this text.
export interface QuoteVersion {
  id: string
  quote_id: string
  number: number
  body: string
  page_start: number
  page_end: number
  edition: string | null
}

export interface AnalysisRead {
  id: string
  work_key: string
  author: ProfileSummary
  body: string
  quote_ids: string[]
  quotes: { quote_id: string; version_id: string }[]
  highlights: Highlight[]
  tags: TagRead[]
  like_count: number
  liked_by_me: boolean
  created_at: string
  // Client-only: the like count the list is ranked by, frozen while a like is pending so the
  // card doesn't jump away under the pointer.
  rank?: number
}

// What the composer needs of a quote: a picked quote, or the version an analysis cites.
export type ComposerQuote = Pick<QuoteRead, 'id' | 'body' | 'page_start' | 'page_end' | 'edition'>

export interface WorkRead {
  work_key: string
  quotes: QuoteRead[]
  analyses: AnalysisRead[]
  // The quote versions the analyses cite, each sent once.
  versions: QuoteVersion[]
  // Tags used by this work's analyses, most used first.
  tags: TagRead[]
}

export interface OverviewRead {
  tags: TagRead[]
  links: { work_key: string; tag_id: string; count: number }[]
}

export interface QuoteCreate {
  body: string
  page_start: number
  page_end: number
  edition?: string | null
}

export interface AnalysisCreate {
  quote_ids: string[]
  highlights: Highlight[]
  tags: string[] // #device names
  characters: string[] // @character names, of the analysis's work
  body: string
}

export function getOverview(): Promise<OverviewRead> {
  return apiFetch<OverviewRead>('/literature/overview')
}

// #devices across the site, or one work's @characters.
export function searchTags(q: string, kind: TagKind = 'device', work?: string): Promise<TagRead[]> {
  const params = new URLSearchParams({ q, kind, ...(work ? { work } : {}) })
  return apiFetch<TagRead[]>(`/literature/tags?${params}`)
}

export function getWork(workKey: string): Promise<WorkRead> {
  return apiFetch<WorkRead>(`/literature/works/${workKey}`)
}

export function createQuote(workKey: string, payload: QuoteCreate): Promise<QuoteRead> {
  return apiFetch<QuoteRead>(`/literature/works/${workKey}/quotes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Anyone may edit a quote; the edit becomes its next version.
export function updateQuote(id: string, payload: QuoteCreate): Promise<void> {
  return apiFetch<void>(`/literature/quotes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteQuote(id: string): Promise<void> {
  return apiFetch<void>(`/literature/quotes/${id}`, { method: 'DELETE' })
}

export function createAnalysis(workKey: string, payload: AnalysisCreate): Promise<AnalysisRead> {
  return apiFetch<AnalysisRead>(`/literature/works/${workKey}/analyses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// The author rewrites their analysis (text, tags, fragments; may drop quotes, not add any).
export function updateAnalysis(id: string, payload: AnalysisCreate): Promise<void> {
  return apiFetch<void>(`/literature/analyses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteAnalysis(id: string): Promise<void> {
  return apiFetch<void>(`/literature/analyses/${id}`, { method: 'DELETE' })
}

export function toggleAnalysisLike(id: string): Promise<{ liked: boolean; like_count: number }> {
  return apiFetch<{ liked: boolean; like_count: number }>(`/literature/analyses/${id}/like`, {
    method: 'POST',
  })
}

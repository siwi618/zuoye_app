import { apiFetch } from './client'
import type { ProfileSummary } from './requests'
import type { HighlightColor, TagKind } from '@/lib/literature/text'

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
  color?: HighlightColor // yellow when absent
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
  comment_count: number
  created_at: string
}

// What the composer needs of a quote: a picked quote, or the version an analysis cites.
export type ComposerQuote = Pick<QuoteRead, 'id' | 'body' | 'page_start' | 'page_end' | 'edition'>

export interface WorkRead {
  work_key: string
  quotes: QuoteRead[]
  // Tags used by this work's analyses, most used first.
  tags: TagRead[]
  // The analyses come a page at a time (listAnalyses); this is how many there are.
  analysis_count: number
}

export type AnalysisSort = 'hot' | 'new' | 'mine'

export interface AnalysisPage {
  items: AnalysisRead[]
  // The quote versions these analyses cite, each sent once.
  versions: QuoteVersion[]
  total: number // analyses matching the filters
  next_offset: number | null // null when this was the last page
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

// One page of a work's analyses, sorted and filtered over all of them by the server.
export function listAnalyses(
  workKey: string,
  p: {
    sort: AnalysisSort
    tag?: string | null
    who?: string | null
    quote?: string | null
    offset: number
    limit: number
  },
): Promise<AnalysisPage> {
  const params = new URLSearchParams({
    sort: p.sort,
    offset: String(p.offset),
    limit: String(p.limit),
  })
  if (p.tag) params.set('tag', p.tag)
  if (p.who) params.set('who', p.who)
  if (p.quote) params.set('quote', p.quote)
  return apiFetch<AnalysisPage>(`/literature/works/${workKey}/analyses?${params}`)
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

// Introductions anyone can edit: a work's (by its key) or a #device's (by its name).
export type IntroKind = 'work' | 'device'

export interface IntroVersion {
  id: string
  number: number
  body: string
  editor: ProfileSummary
  created_at: string
}

export interface IntroRead {
  kind: IntroKind
  key: string
  current: IntroVersion | null // null: nobody has written one yet
  version_count: number
}

const introPath = (kind: IntroKind, key: string) =>
  `/literature/intros/${kind}/${encodeURIComponent(key)}`

export function getIntro(kind: IntroKind, key: string): Promise<IntroRead> {
  return apiFetch<IntroRead>(introPath(kind, key))
}

export function introHistory(kind: IntroKind, key: string): Promise<IntroVersion[]> {
  return apiFetch<IntroVersion[]>(`${introPath(kind, key)}/history`)
}

// Saves the text as the next version; bringing back an older text is saving it again.
export function saveIntro(kind: IntroKind, key: string, body: string): Promise<IntroRead> {
  return apiFetch<IntroRead>(introPath(kind, key), {
    method: 'PUT',
    body: JSON.stringify({ body }),
  })
}

// Comments on analyses, like the forum's: two levels, likes, no attachments.
export type CommentSort = 'top' | 'new'

export interface LitComment {
  id: string
  analysis_id: string
  author: ProfileSummary
  body: string
  like_count: number
  liked_by_me: boolean
  created_at: string
  // Replies only: the thread's top-level comment, and whose comment was answered.
  parent_id: string | null
  reply_to: ProfileSummary | null
  // Client-only: shown at once, greyed out, while it is being sent.
  pending?: boolean
}

export function listComments(analysisId: string, sort: CommentSort): Promise<LitComment[]> {
  return apiFetch<LitComment[]>(`/literature/analyses/${analysisId}/comments?sort=${sort}`)
}

export function createComment(
  analysisId: string,
  body: string,
  replyToId?: string,
): Promise<LitComment> {
  return apiFetch<LitComment>(`/literature/analyses/${analysisId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, reply_to_id: replyToId ?? null }),
  })
}

export function deleteComment(id: string): Promise<void> {
  return apiFetch<void>(`/literature/comments/${id}`, { method: 'DELETE' })
}

export function toggleCommentLike(id: string): Promise<{ liked: boolean; like_count: number }> {
  return apiFetch<{ liked: boolean; like_count: number }>(`/literature/comments/${id}/like`, {
    method: 'POST',
  })
}

// A #device across the works: which works' analyses use it, and how often.
export interface DeviceRead {
  name: string
  tag_id: string | null // null: no analysis uses it (yet)
  total: number
  works: { work_key: string; tag_id: string; count: number }[] // most used first
}

export function getDevice(name: string): Promise<DeviceRead> {
  return apiFetch<DeviceRead>(`/literature/devices/${encodeURIComponent(name)}`)
}

import { useMemo } from 'react'
import { infiniteQueryOptions, keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import {
  listAnalyses,
  type AnalysisPage,
  type AnalysisRead,
  type AnalysisSort,
  type QuoteVersion,
} from '@/api/literature'

// Analyses loaded per page while scrolling.
export const PAGE_SIZE = 20

export interface AnalysisFilters {
  sort: AnalysisSort
  tag?: string | null // a #device
  who?: string | null // an @character
  quote?: string | null
}

// One work's analyses, sorted and filtered by the server and loaded PAGE_SIZE at a time. Every
// list of a work shares the key prefix ['literature-analyses', workKey], so a like or a delete
// can update them all.
export const analysesQuery = (workKey: string | null, f: AnalysisFilters) =>
  infiniteQueryOptions({
    queryKey: [
      'literature-analyses',
      workKey,
      f.sort,
      f.tag ?? null,
      f.who ?? null,
      f.quote ?? null,
    ],
    queryFn: ({ pageParam }) =>
      listAnalyses(workKey!, { ...f, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last: AnalysisPage) => last.next_offset ?? undefined,
  })

export function useAnalysisList(workKey: string | null, f: AnalysisFilters) {
  const list = useInfiniteQuery({
    ...analysesQuery(workKey, f),
    // Changing the sort or a filter keeps the old list on screen until the new one arrives.
    placeholderData: keepPreviousData,
    enabled: !!workKey,
  })
  const { analyses, versions } = useMemo(() => {
    // A page boundary can shift while scrolling (a new analysis, a changed like count): skip
    // anything already shown.
    const seen = new Set<string>()
    const items: AnalysisRead[] = []
    const vs = new Map<string, QuoteVersion>()
    for (const page of list.data?.pages ?? []) {
      for (const a of page.items) {
        if (seen.has(a.id)) continue
        seen.add(a.id)
        items.push(a)
      }
      for (const v of page.versions) vs.set(v.id, v)
    }
    return { analyses: items, versions: vs }
  }, [list.data])
  return { workKey, list, analyses, versions, matching: list.data?.pages[0]?.total ?? 0 }
}

export type AnalysisListState = ReturnType<typeof useAnalysisList>

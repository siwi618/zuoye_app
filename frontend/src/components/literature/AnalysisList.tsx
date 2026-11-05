import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import {
  deleteAnalysis,
  toggleAnalysisLike,
  type AnalysisPage,
  type AnalysisRead,
} from '@/api/literature'
import { PAGE_SIZE, type AnalysisListState } from '@/lib/literature/analysisList'
import type { TagKind } from '@/lib/literature/text'
import { AnalysisCard } from './AnalysisCard'

const K = 'tools.literature'

// A work's analyses as cards, loading the next page as the end of the list scrolls into view.
// Likes and deletes show at once in every loaded list of that work (any sort or filter).
export function AnalysisList({
  state: { workKey, list, analyses, versions },
  empty,
  onTag,
  scroller,
}: {
  state: AnalysisListState
  empty: ReactNode // shown when nothing matches
  onTag: (name: string, kind: TagKind) => void
  scroller?: RefObject<HTMLElement | null> // the box the list scrolls in, if not the page
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list

  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = end.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { root: scroller?.current ?? null, rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, scroller])

  const allKey = ['literature-analyses', workKey]
  const patch = (fn: (a: AnalysisRead) => AnalysisRead | null) =>
    queryClient.setQueriesData<InfiniteData<AnalysisPage>>(
      { queryKey: allKey },
      (d) =>
        d && {
          ...d,
          pages: d.pages.map((p) => ({
            ...p,
            items: p.items.flatMap((a) => {
              const next = fn(a)
              return next ? [next] : []
            }),
          })),
        },
    )
  const optimistic = async (fn: (a: AnalysisRead) => AnalysisRead | null) => {
    await queryClient.cancelQueries({ queryKey: allKey })
    const prev = queryClient.getQueriesData<InfiniteData<AnalysisPage>>({ queryKey: allKey })
    patch(fn)
    return { prev }
  }
  const rollback = (ctx?: { prev: [QueryKey, unknown][] }) =>
    ctx?.prev.forEach(([k, d]) => queryClient.setQueryData(k, d))

  // Deleting hides the analysis at once (a 404 means it is already gone, which is done).
  const remove = useMutation({
    mutationFn: async (id: string) => {
      try {
        await deleteAnalysis(id)
      } catch (e) {
        if (!(e instanceof Error && e.message.startsWith('API 404'))) throw e
      }
    },
    onMutate: (id: string) => optimistic((a) => (a.id === id ? null : a)),
    onError: (e, _id, ctx) => {
      rollback(ctx)
      toast.error(e instanceof Error ? e.message : t('common.error'))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: allKey })
      void queryClient.invalidateQueries({ queryKey: ['literature-work', workKey] })
      void queryClient.invalidateQueries({ queryKey: ['literature-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['literature-device'] })
    },
  })
  // Liking shows at once; the server's count replaces the guess when it answers. The list keeps
  // its order until it is next loaded, so the card doesn't jump away under the pointer.
  const like = useMutation({
    mutationFn: toggleAnalysisLike,
    onMutate: (id: string) =>
      optimistic((a) =>
        a.id === id
          ? {
              ...a,
              liked_by_me: !a.liked_by_me,
              like_count: a.like_count + (a.liked_by_me ? -1 : 1),
            }
          : a,
      ),
    onSuccess: (res, id) =>
      patch((a) =>
        a.id === id ? { ...a, liked_by_me: res.liked, like_count: res.like_count } : a,
      ),
    onError: (e, _id, ctx) => {
      rollback(ctx)
      toast.error(e instanceof Error ? e.message : t('common.error'))
    },
  })

  if (analyses.length) {
    return (
      <div className="space-y-4">
        {analyses.map((a) => (
          <AnalysisCard
            key={a.id}
            analysis={a}
            versions={versions}
            mine={a.author.id === userId}
            deleting={remove.isPending && remove.variables === a.id}
            onTag={onTag}
            onLike={() => like.mutate(a.id)}
            onCommentCount={(d) =>
              patch((x) => (x.id === a.id ? { ...x, comment_count: x.comment_count + d } : x))
            }
            onDelete={() => remove.mutate(a.id)}
          />
        ))}
        <div ref={end} className="py-2 text-center text-sm text-muted-foreground">
          {isFetchingNextPage ? (
            t('common.loading')
          ) : hasNextPage ? (
            <Button variant="ghost" size="sm" onClick={() => void fetchNextPage()}>
              {t(`${K}.loadMore`)}
            </Button>
          ) : (
            analyses.length > PAGE_SIZE && t(`${K}.allShown`, { count: analyses.length })
          )}
        </div>
      </div>
    )
  }
  if (list.isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
  if (list.isError)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">
        {list.error instanceof Error ? list.error.message : t('common.error')}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => list.refetch()}>
          {t(`${K}.retry`)}
        </Button>
      </div>
    )
  return (
    <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {empty}
    </p>
  )
}

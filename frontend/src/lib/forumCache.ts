import type { QueryClient } from '@tanstack/react-query'
import type { CommentRead, PostRead } from '@/api/forum'

// Helpers for optimistic updates: patch a post or comment in every cached
// query that holds it, so the detail page and the lists stay in sync without
// waiting for a refetch.

export function patchPost(
  qc: QueryClient,
  postId: string,
  patch: (post: PostRead) => PostRead,
): void {
  qc.setQueryData<PostRead>(['forum-post', postId], (old) => (old ? patch(old) : old))
  qc.setQueriesData<PostRead[]>({ queryKey: ['forum-posts'] }, (list) =>
    list?.map((p) => (p.id === postId ? patch(p) : p)),
  )
}

export function findPostInLists(qc: QueryClient, postId: string): PostRead | undefined {
  for (const [, list] of qc.getQueriesData<PostRead[]>({ queryKey: ['forum-posts'] })) {
    const hit = list?.find((p) => p.id === postId)
    if (hit) return hit
  }
  return undefined
}

export function patchComments(
  qc: QueryClient,
  postId: string,
  patch: (comments: CommentRead[]) => CommentRead[],
): void {
  qc.setQueriesData<CommentRead[]>({ queryKey: ['forum-comments', postId] }, (list) =>
    list ? patch(list) : list,
  )
}

export function patchComment(
  qc: QueryClient,
  postId: string,
  commentId: string,
  patch: (comment: CommentRead) => CommentRead,
): void {
  patchComments(qc, postId, (list) => list.map((c) => (c.id === commentId ? patch(c) : c)))
}

// Snapshot everything the forum mutations touch, for rollback on error.
export function snapshotForum(qc: QueryClient, postId: string) {
  const saved = [
    ...qc.getQueriesData({ queryKey: ['forum-post', postId] }),
    ...qc.getQueriesData({ queryKey: ['forum-posts'] }),
    ...qc.getQueriesData({ queryKey: ['forum-comments', postId] }),
  ]
  return () => {
    for (const [key, data] of saved) qc.setQueryData(key, data)
  }
}

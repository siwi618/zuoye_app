import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Eye, Heart, MessageCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import {
  createComment,
  deleteComment,
  deletePost,
  getPost,
  listComments,
  recordView,
  toggleCommentLike,
  togglePostLike,
  type CommentRead,
  type CommentSort,
} from '@/api/forum'
import type { MediaRead } from '@/api/media'
import { MediaGallery } from '@/components/MediaGallery'
import { MediaUploader } from '@/components/MediaUploader'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import {
  findPostInLists,
  patchComment,
  patchComments,
  patchPost,
  snapshotForum,
} from '@/lib/forumCache'

// Count a view at most once per post per browser session.
function useRecordView(
  postId: string | undefined,
  onCounted: () => void,
  onRecorded: (viewCount: number) => void,
) {
  useEffect(() => {
    if (!postId) return
    const key = `forum-viewed:${postId}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // storage unavailable — still count the view
    }
    onCounted()
    void recordView(postId)
      .then((res) => onRecorded(res.view_count))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])
}

export function PostDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  const post = useQuery({
    queryKey: ['forum-post', id],
    queryFn: () => getPost(id!),
    enabled: !!id,
    // Opened from the list: show what the list already has while fetching.
    placeholderData: () => (id ? findPostInLists(queryClient, id) : undefined),
  })

  // Views: +1 on screen right away, then settle on the server's count.
  useRecordView(
    id,
    () => patchPost(queryClient, id!, (p) => ({ ...p, view_count: p.view_count + 1 })),
    (viewCount) => patchPost(queryClient, id!, (p) => ({ ...p, view_count: viewCount })),
  )

  // Likes: flip on screen immediately; roll back if the server says no.
  const like = useMutation({
    mutationFn: () => togglePostLike(id!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['forum-post', id] })
      const rollback = snapshotForum(queryClient, id!)
      patchPost(queryClient, id!, (p) => ({
        ...p,
        liked_by_me: !p.liked_by_me,
        like_count: p.like_count + (p.liked_by_me ? -1 : 1),
      }))
      return { rollback }
    },
    onSuccess: (res) =>
      patchPost(queryClient, id!, (p) => ({ ...p, liked_by_me: res.liked, like_count: res.like_count })),
    onError: (err, _vars, ctx) => {
      ctx?.rollback()
      toast.error(err instanceof Error ? err.message : t('common.error'))
    },
  })

  const remove = useMutation({
    mutationFn: () => deletePost(id!),
    onSuccess: () => {
      toast.success(t('forum.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['forum-posts'] })
      navigate('/forum', { replace: true })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('common.error')),
  })

  if (post.isLoading) {
    return <p className="text-muted-foreground">{t('common.loading')}</p>
  }
  if (post.isError || !post.data) {
    return (
      <p className="text-destructive">
        {post.error instanceof Error ? post.error.message : t('common.error')}
      </p>
    )
  }

  const p = post.data
  const initials = p.author.display_name.slice(0, 2).toUpperCase()
  const isAuthor = p.author.id === userId

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        to="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('forum.back')}
      </Link>

      <article className="rounded-2xl border border-border/60 bg-card p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold leading-snug tracking-tight">{p.title}</h1>
          <Badge variant="open" className="shrink-0">
            {t(`forumTags.${p.tag}`, { defaultValue: p.tag })}
          </Badge>
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Avatar className="size-7">
            <AvatarFallback className="bg-brand-100 text-[11px] font-semibold text-brand-700">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-foreground">{p.author.display_name}</span>
          <span>{new Date(p.created_at).toLocaleString()}</span>
        </div>

        <p className="mt-5 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
          {p.body}
        </p>
        <MediaGallery media={p.media} className="mt-4" />

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4 text-sm text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            onClick={() => !like.isPending && like.mutate()}
            className={cn('gap-1.5 rounded-full', p.liked_by_me && 'border-rose-200 text-rose-600')}
          >
            <Heart className={cn('size-4', p.liked_by_me && 'fill-rose-500 text-rose-500')} />
            {p.like_count}
          </Button>
          <span className="inline-flex items-center gap-1">
            <Eye className="size-4" />
            {p.view_count} {t('forum.views')}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-4" />
            {p.comment_count}
          </span>
          {isAuthor && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t('forum.deletePostConfirm'))) remove.mutate()
              }}
            >
              <Trash2 className="size-4" />
              {t('forum.delete')}
            </Button>
          )}
        </div>
      </article>

      <CommentsSection postId={p.id} />
    </div>
  )
}

function CommentsSection({ postId }: { postId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const userId = user?.id
  const [sort, setSort] = useState<CommentSort>('top')
  const [body, setBody] = useState('')
  const [media, setMedia] = useState<MediaRead[]>([])
  const [uploading, setUploading] = useState(false)

  const comments = useQuery({
    queryKey: ['forum-comments', postId, sort],
    queryFn: () => listComments(postId, sort),
  })

  // Comments appear immediately (greyed out as "sending") and are swapped for
  // the server's copy when it arrives; on failure the draft goes back in the box.
  const submit = useMutation({
    mutationFn: (draft: { body: string; media: MediaRead[] }) =>
      createComment(postId, draft.body, draft.media.map((m) => m.id)),
    onMutate: async (draft) => {
      await queryClient.cancelQueries({ queryKey: ['forum-comments', postId] })
      const rollback = snapshotForum(queryClient, postId)
      const tempId = `pending-${Date.now()}`
      const temp: CommentRead = {
        id: tempId,
        post_id: postId,
        author: {
          id: userId ?? '',
          display_name: (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? '',
          avatar_url: null,
        },
        body: draft.body,
        media: draft.media,
        like_count: 0,
        liked_by_me: false,
        created_at: new Date().toISOString(),
        pending: true,
      }
      patchComments(queryClient, postId, (list) => [temp, ...list])
      patchPost(queryClient, postId, (p) => ({ ...p, comment_count: p.comment_count + 1 }))
      setBody('')
      setMedia([])
      return { rollback, tempId }
    },
    onSuccess: (comment, _draft, ctx) =>
      patchComments(queryClient, postId, (list) =>
        list.map((c) => (c.id === ctx?.tempId ? comment : c)),
      ),
    onError: (err, draft, ctx) => {
      ctx?.rollback()
      setBody(draft.body)
      setMedia(draft.media)
      toast.error(err instanceof Error ? err.message : t('common.error'))
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    submit.mutate({ body: body.trim(), media })
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t('forum.comments')}</h2>
        <div className="flex gap-1 rounded-full bg-secondary p-1">
          {(['top', 'new'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                sort === value ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground',
              )}
            >
              {value === 'top' ? t('forum.commentTop') : t('forum.commentNew')}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-2xl border border-border/60 bg-card/70 p-4"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('forum.commentPlaceholder')}
          maxLength={2000}
          rows={3}
        />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <MediaUploader value={media} onChange={setMedia} onUploadingChange={setUploading} />
          <Button type="submit" size="sm" disabled={uploading || !body.trim()}>
            {t('forum.commentSubmit')}
          </Button>
        </div>
      </form>

      {comments.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (comments.data?.length ?? 0) === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-sm text-muted-foreground">
          <MessageCircle className="size-4 shrink-0" />
          {t('forum.commentsEmpty')}
        </div>
      ) : (
        <div className="space-y-3">
          {comments.data!.map((c) => (
            <CommentItem key={c.id} comment={c} isMine={c.author.id === userId} />
          ))}
        </div>
      )}
    </section>
  )
}

function CommentItem({ comment, isMine }: { comment: CommentRead; isMine: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const postId = comment.post_id
  const initials = comment.author.display_name.slice(0, 2).toUpperCase()

  const like = useMutation({
    mutationFn: () => toggleCommentLike(comment.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['forum-comments', postId] })
      const rollback = snapshotForum(queryClient, postId)
      patchComment(queryClient, postId, comment.id, (c) => ({
        ...c,
        liked_by_me: !c.liked_by_me,
        like_count: c.like_count + (c.liked_by_me ? -1 : 1),
      }))
      return { rollback }
    },
    onSuccess: (res) =>
      patchComment(queryClient, postId, comment.id, (c) => ({
        ...c,
        liked_by_me: res.liked,
        like_count: res.like_count,
      })),
    onError: (err, _vars, ctx) => {
      ctx?.rollback()
      toast.error(err instanceof Error ? err.message : t('common.error'))
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['forum-comments', postId] })
      const rollback = snapshotForum(queryClient, postId)
      patchComments(queryClient, postId, (list) => list.filter((c) => c.id !== comment.id))
      patchPost(queryClient, postId, (p) => ({ ...p, comment_count: p.comment_count - 1 }))
      return { rollback }
    },
    onError: (err, _vars, ctx) => {
      ctx?.rollback()
      toast.error(err instanceof Error ? err.message : t('common.error'))
    },
  })

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card p-4 shadow-soft transition-opacity',
        comment.pending && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="bg-brand-100 text-xs font-semibold text-brand-700">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm leading-tight">
            <p className="font-medium">{comment.author.display_name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {comment.pending ? t('forum.sending') : new Date(comment.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className={cn('flex items-center gap-1', comment.pending && 'pointer-events-none')}>
          {isMine && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-destructive"
              aria-label={t('forum.delete')}
              onClick={() => {
                if (window.confirm(t('forum.deleteCommentConfirm'))) remove.mutate()
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-8 gap-1 px-2 text-muted-foreground', comment.liked_by_me && 'text-rose-600')}
            onClick={() => !like.isPending && like.mutate()}
          >
            <Heart className={cn('size-3.5', comment.liked_by_me && 'fill-rose-500 text-rose-500')} />
            {comment.like_count}
          </Button>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap pl-11 text-sm text-foreground/90">{comment.body}</p>
      <MediaGallery media={comment.media} className="mt-3 pl-11" />
    </div>
  )
}

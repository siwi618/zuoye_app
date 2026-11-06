import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Heart, MessageCircle, Reply, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import {
  createComment,
  deleteComment,
  listComments,
  toggleCommentLike,
  type CommentSort,
  type LitComment,
} from '@/api/literature'
import { BadgeTag } from '@/components/BadgeTag'
import { useMyProfile } from '@/api/profile'

// A reply's thread is its top-level comment.
const threadOf = (c: LitComment) => c.parent_id ?? c.id

type Patch = (list: LitComment[]) => LitComment[]

// Comments under an analysis, like the forum's: two levels (a reply to a reply joins the same
// thread and names whose comment it answers), likes, newest or most liked first, no attachments.
// New comments show at once, greyed out until the server has them. `onCount` tells the card how
// many comments were added (or removed) so its count stays right.
export function AnalysisComments({
  analysisId,
  onCount,
}: {
  analysisId: string
  onCount: (delta: number) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const userId = user?.id
  const wornBadge = useMyProfile().data?.worn_badge ?? null
  const [sort, setSort] = useState<CommentSort>('top')
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<LitComment | null>(null)
  const [replyBody, setReplyBody] = useState('')
  // Threads whose replies are shown; replies start folded.
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const setThreadOpen = (id: string, on: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const allKey = ['literature-comments', analysisId]
  const comments = useQuery({
    queryKey: [...allKey, sort],
    queryFn: () => listComments(analysisId, sort),
  })

  // Changes apply to both orders' lists; a snapshot puts them back if the server says no.
  const patch = (fn: Patch) =>
    queryClient.setQueriesData<LitComment[]>({ queryKey: allKey }, (list) => list && fn(list))
  const snapshot = async () => {
    await queryClient.cancelQueries({ queryKey: allKey })
    return queryClient.getQueriesData<LitComment[]>({ queryKey: allKey })
  }
  const restore = (prev?: [QueryKey, unknown][]) =>
    prev?.forEach(([k, d]) => queryClient.setQueryData(k, d))

  const submit = useMutation({
    mutationFn: (draft: { body: string; replyTo: LitComment | null }) =>
      createComment(analysisId, draft.body, draft.replyTo?.id),
    onMutate: async (draft) => {
      const prev = await snapshot()
      const tempId = `pending-${Date.now()}`
      const temp: LitComment = {
        id: tempId,
        analysis_id: analysisId,
        author: {
          id: userId ?? '',
          display_name:
            (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? '',
          avatar_url: null,
          worn_badge: wornBadge,
        },
        body: draft.body,
        like_count: 0,
        liked_by_me: false,
        created_at: new Date().toISOString(),
        parent_id: draft.replyTo ? threadOf(draft.replyTo) : null,
        reply_to: draft.replyTo?.author ?? null,
        pending: true,
      }
      if (draft.replyTo) {
        patch((list) => [...list, temp])
        setThreadOpen(threadOf(draft.replyTo), true)
        setReplyTo(null)
        setReplyBody('')
      } else {
        patch((list) => [temp, ...list])
        setBody('')
      }
      onCount(1)
      return { prev, tempId }
    },
    onSuccess: (comment, _draft, ctx) =>
      patch((list) => list.map((c) => (c.id === ctx?.tempId ? comment : c))),
    onError: (e, draft, ctx) => {
      restore(ctx?.prev)
      onCount(-1)
      if (draft.replyTo) {
        setReplyTo(draft.replyTo)
        setReplyBody(draft.body)
      } else setBody(draft.body)
      toast.error(e instanceof Error ? e.message : t('common.error'))
    },
  })

  const startReply = (target: LitComment) => {
    if (replyTo?.id !== target.id) setReplyBody('')
    setReplyTo(target)
  }

  // Top-level comments keep the server's order; replies read oldest first under their thread.
  const all = comments.data ?? []
  const tops = all.filter((c) => !c.parent_id)
  const replies = new Map<string, LitComment[]>()
  for (const c of all) {
    if (!c.parent_id) continue
    replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c])
  }
  for (const list of replies.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at))

  const item = (c: LitComment, replyCount: number) => (
    <CommentItem
      key={c.id}
      comment={c}
      isMine={c.author.id === userId}
      replyCount={replyCount}
      onReply={() => startReply(c)}
      patch={patch}
      snapshot={snapshot}
      restore={restore}
      onCount={onCount}
    />
  )

  return (
    <section className="space-y-3 border-t border-border/60 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{t('forum.comments')}</h4>
        <div className="flex gap-1 rounded-full bg-secondary p-1">
          {(['top', 'new'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              className={cn(
                'rounded-full px-3 py-0.5 text-xs font-medium transition-colors',
                sort === value ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground',
              )}
            >
              {value === 'top' ? t('forum.commentTop') : t('forum.commentNew')}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (body.trim()) submit.mutate({ body: body.trim(), replyTo: null })
        }}
        className="space-y-2"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('forum.commentPlaceholder')}
          maxLength={2000}
          rows={2}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!body.trim()}>
            {t('forum.commentSubmit')}
          </Button>
        </div>
      </form>

      {comments.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : tops.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageCircle className="size-4 shrink-0" />
          {t('forum.commentsEmpty')}
        </p>
      ) : (
        <div className="space-y-3">
          {tops.map((c) => {
            const rs = replies.get(c.id) ?? []
            const shown = open.has(c.id)
            return (
              <div key={c.id} className="rounded-xl bg-secondary/40 p-3">
                {item(c, rs.length)}
                {rs.length > 0 && (
                  <div className="mt-3 ml-9 space-y-3 border-l-2 border-border/60 pl-3">
                    {shown && rs.map((r) => item(r, 0))}
                    <button
                      type="button"
                      onClick={() => setThreadOpen(c.id, !shown)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {shown ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      {shown
                        ? t('forum.hideReplies')
                        : t('forum.showReplies', { count: rs.length })}
                    </button>
                  </div>
                )}
                {replyTo && threadOf(replyTo) === c.id && (
                  <form
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault()
                      if (replyBody.trim()) submit.mutate({ body: replyBody.trim(), replyTo })
                    }}
                    className="mt-3 ml-9 space-y-2"
                  >
                    <Textarea
                      autoFocus
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder={t('forum.replyPlaceholder', {
                        name: replyTo.author.display_name,
                      })}
                      maxLength={2000}
                      rows={2}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setReplyTo(null)}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button type="submit" size="sm" disabled={!replyBody.trim()}>
                        {t('forum.reply')}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CommentItem({
  comment: c,
  isMine,
  replyCount,
  onReply,
  patch,
  snapshot,
  restore,
  onCount,
}: {
  comment: LitComment
  isMine: boolean
  replyCount: number // replies removed along with this comment (top-level only)
  onReply: () => void
  patch: (fn: Patch) => void
  snapshot: () => Promise<[QueryKey, unknown][]>
  restore: (prev?: [QueryKey, unknown][]) => void
  onCount: (delta: number) => void
}) {
  const { t } = useTranslation()
  const isReply = c.parent_id !== null

  const like = useMutation({
    mutationFn: () => toggleCommentLike(c.id),
    onMutate: async () => {
      const prev = await snapshot()
      patch((list) =>
        list.map((x) =>
          x.id === c.id
            ? {
                ...x,
                liked_by_me: !x.liked_by_me,
                like_count: x.like_count + (x.liked_by_me ? -1 : 1),
              }
            : x,
        ),
      )
      return { prev }
    },
    onSuccess: (res) =>
      patch((list) =>
        list.map((x) =>
          x.id === c.id ? { ...x, liked_by_me: res.liked, like_count: res.like_count } : x,
        ),
      ),
    onError: (e, _v, ctx) => {
      restore(ctx?.prev)
      toast.error(e instanceof Error ? e.message : t('common.error'))
    },
  })

  // Deleting a top-level comment takes its replies with it.
  const remove = useMutation({
    mutationFn: () => deleteComment(c.id),
    onMutate: async () => {
      const prev = await snapshot()
      patch((list) => list.filter((x) => x.id !== c.id && x.parent_id !== c.id))
      onCount(-1 - replyCount)
      return { prev }
    },
    onError: (e, _v, ctx) => {
      restore(ctx?.prev)
      onCount(1 + replyCount)
      toast.error(e instanceof Error ? e.message : t('common.error'))
    },
  })

  return (
    <div className={cn('transition-opacity', c.pending && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Avatar className={isReply ? 'size-6' : 'size-7'}>
            <AvatarFallback
              className={cn(
                'bg-brand-100 font-semibold text-brand-700',
                isReply ? 'text-[10px]' : 'text-[11px]',
              )}
            >
              {c.author.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm leading-tight">
            <p className="font-medium">
              {c.author.display_name}
              <BadgeTag badge={c.author.worn_badge} className="ml-1" />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {c.pending ? t('forum.sending') : new Date(c.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className={cn('flex items-center gap-0.5', c.pending && 'pointer-events-none')}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-muted-foreground"
            onClick={onReply}
          >
            <Reply className="size-3.5" />
            {t('forum.reply')}
          </Button>
          {isMine && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-destructive"
              aria-label={t('forum.delete')}
              onClick={() => window.confirm(t('forum.deleteCommentConfirm')) && remove.mutate()}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 gap-1 px-2 text-muted-foreground', c.liked_by_me && 'text-rose-600')}
            onClick={() => !like.isPending && like.mutate()}
          >
            <Heart className={cn('size-3.5', c.liked_by_me && 'fill-rose-500 text-rose-500')} />
            {c.like_count}
          </Button>
        </div>
      </div>
      <p
        className={cn(
          'mt-1.5 whitespace-pre-wrap text-sm text-foreground/90',
          isReply ? 'pl-8' : 'pl-9',
        )}
      >
        {isReply && c.reply_to && (
          <>
            {t('forum.replyPrefix')}
            <span className="text-muted-foreground">{c.reply_to.display_name}</span>
            {t('forum.replySuffix')}
          </>
        )}
        {c.body}
      </p>
    </div>
  )
}

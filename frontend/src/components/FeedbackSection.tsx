import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageSquareQuote, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { StarRating } from '@/components/StarRating'
import { createFeedback, listFeedbacks, type FeedbackRead } from '@/api/feedback'
import { useAuthStore } from '@/store/auth'

export function FeedbackSection({
  requestId,
  canLeaveFeedback,
}: {
  requestId: string
  canLeaveFeedback: boolean
}) {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()

  const feedbacks = useQuery({
    queryKey: ['feedbacks', requestId],
    queryFn: () => listFeedbacks(requestId),
  })

  const myExisting = feedbacks.data?.find((f) => f.from_user.id === userId)
  const showForm = canLeaveFeedback && !myExisting

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')

  const submit = useMutation({
    mutationFn: () => createFeedback(requestId, { rating, comment: comment.trim() }),
    onSuccess: (fb) => {
      toast.success(t('feedback.submit'))
      setRating(0)
      setComment('')
      queryClient.setQueryData<FeedbackRead[]>(['feedbacks', requestId], (old) => [...(old ?? []), fb])
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      // The request is no longer "待评价" for this user.
      void queryClient.invalidateQueries({ queryKey: ['request', requestId] })
      void queryClient.invalidateQueries({ queryKey: ['requests'] })
      void queryClient.invalidateQueries({ queryKey: ['pending-reviews'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('common.error')),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (rating < 1 || !comment.trim()) return
    submit.mutate()
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-600">
          <Star className="size-4.5 fill-current" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{t('feedback.title')}</h2>
      </div>

      {feedbacks.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          {(feedbacks.data?.length ?? 0) === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-sm text-muted-foreground">
              <MessageSquareQuote className="size-4 shrink-0" />
              {t('feedback.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.data!.map((fb) => {
                const fromInitials = fb.from_user.display_name.slice(0, 2).toUpperCase()
                return (
                  <div
                    key={fb.id}
                    className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-brand-100 text-sm font-semibold text-brand-700">
                            {fromInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-sm leading-tight">
                          <p>
                            <span className="font-medium">{fb.from_user.display_name}</span>
                            <span className="text-muted-foreground"> {t('feedback.to').toLowerCase()} </span>
                            <span className="font-medium">{fb.to_user.display_name}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {new Date(fb.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <StarRating value={fb.rating} size="sm" />
                    </div>
                    {fb.comment && (
                      <p className="mt-3 whitespace-pre-wrap pl-12 text-sm text-foreground/90">
                        {fb.comment}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {showForm && (
            <>
              <Separator />
              <form
                onSubmit={onSubmit}
                className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-5"
              >
                <h3 className="text-sm font-semibold">{t('feedback.leave')}</h3>
                <div className="space-y-2">
                  <Label>{t('feedback.rating')}</Label>
                  <StarRating value={rating} onChange={setRating} size="lg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comment">{t('feedback.comment')}</Label>
                  <Textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    required
                    minLength={1}
                    maxLength={1000}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={submit.isPending || rating < 1 || !comment.trim()}
                  >
                    {submit.isPending ? '…' : t('feedback.submit')}
                  </Button>
                </div>
              </form>
            </>
          )}

          {canLeaveFeedback && myExisting && (
            <p className="text-sm text-muted-foreground">{t('feedback.alreadyLeft')}</p>
          )}
        </>
      )}
    </section>
  )
}

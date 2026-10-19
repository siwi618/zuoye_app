import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createPost } from '@/api/forum'
import { FORUM_TAG_OPTIONS } from '@/lib/constants'

export function NewPost() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tag, setTag] = useState('')

  const mutation = useMutation({
    mutationFn: createPost,
    onSuccess: (post) => {
      toast.success(t('forum.posted'))
      void queryClient.invalidateQueries({ queryKey: ['forum-posts'] })
      navigate(`/forum/${post.id}`, { replace: true })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('forum.postFailed'))
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate({ title: title.trim(), body: body.trim(), tag })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('request.back')}
      </button>

      <Card className="overflow-hidden">
        <CardHeader className="gap-3 border-b border-border/60 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <MessagesSquare className="size-5" />
            </span>
            <div>
              <CardTitle className="text-xl">{t('forum.newPost')}</CardTitle>
              <CardDescription>{t('forum.newPostSubtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">{t('forum.postTitle')}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('forum.titlePlaceholder')}
                required
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tag">{t('forum.tag')}</Label>
              <Select value={tag} onValueChange={setTag} required>
                <SelectTrigger id="tag" className="w-full">
                  <SelectValue placeholder={t('forum.tagPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {FORUM_TAG_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`forumTags.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">{t('forum.body')}</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                minLength={1}
                maxLength={5000}
                rows={8}
                placeholder={t('forum.bodyPlaceholder')}
              />
              <p className="text-right text-xs text-muted-foreground">{body.length} / 5000</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending || !title.trim() || !body.trim() || !tag}
              >
                {mutation.isPending ? '…' : t('forum.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

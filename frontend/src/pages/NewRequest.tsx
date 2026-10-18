import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, PencilLine } from 'lucide-react'
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
import { createRequest, type RequestMode } from '@/api/requests'
import { SUBJECT_OPTIONS, GRADE_OPTIONS } from '@/lib/constants'

export function NewRequest() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<RequestMode>('either')

  const mutation = useMutation({
    mutationFn: createRequest,
    onSuccess: (req) => {
      toast.success(t('request.posted'))
      void queryClient.invalidateQueries({ queryKey: ['requests'] })
      navigate(`/requests/${req.id}`, { replace: true })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('request.postFailed'))
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      grade,
      subject,
      topic: topic.trim() || null,
      description,
      mode,
    })
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
              <PencilLine className="size-5" />
            </span>
            <div>
              <CardTitle className="text-xl">{t('dashboard.newRequest')}</CardTitle>
              <CardDescription>{t('request.newRequestSubtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="grade">{t('auth.grade')}</Label>
                <Select value={grade} onValueChange={setGrade} required>
                  <SelectTrigger id="grade" className="w-full">
                    <SelectValue placeholder={t('request.gradePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADE_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {t(`grades.${g}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">{t('request.subject')}</Label>
                <Select value={subject} onValueChange={setSubject} required>
                  <SelectTrigger id="subject" className="w-full">
                    <SelectValue placeholder={t('request.subjectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECT_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`subjects.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic">{t('request.topic')}</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t('request.topicPlaceholder')}
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('request.description')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={1}
                maxLength={2000}
                rows={6}
                placeholder={t('request.descriptionPlaceholder')}
              />
              <p className="text-right text-xs text-muted-foreground">{description.length} / 2000</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mode">{t('request.mode')}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as RequestMode)}>
                <SelectTrigger id="mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">{t('request.online')}</SelectItem>
                  <SelectItem value="offline">{t('request.offline')}</SelectItem>
                  <SelectItem value="either">{t('request.either')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending || !grade || !subject || !description}
              >
                {mutation.isPending ? '…' : t('request.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

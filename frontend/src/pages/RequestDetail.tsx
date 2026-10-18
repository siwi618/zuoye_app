import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  GraduationCap,
  MapPin,
  Users,
  Video,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  acceptRequest,
  cancelRequest,
  completeRequest,
  getRequest,
  scheduleRequest,
  type RequestRead,
  type RequestStatus,
} from '@/api/requests'
import { useAuthStore } from '@/store/auth'
import { FeedbackSection } from '@/components/FeedbackSection'

const statusMeta: Record<
  RequestStatus,
  { variant: 'open' | 'accepted' | 'completed' | 'cancelled'; Icon: typeof CircleDot }
> = {
  open: { variant: 'open', Icon: CircleDot },
  accepted: { variant: 'accepted', Icon: Clock },
  completed: { variant: 'completed', Icon: CheckCircle2 },
  cancelled: { variant: 'cancelled', Icon: XCircle },
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16)
}

function ModeIcon({ mode }: { mode: RequestRead['mode'] }) {
  if (mode === 'online') return <Video className="size-4" />
  if (mode === 'offline') return <MapPin className="size-4" />
  return <CircleDot className="size-4" />
}

function InfoRow({
  Icon,
  label,
  children,
}: {
  Icon: typeof CalendarClock
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div className="space-y-0.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-sm font-medium">{children}</div>
      </div>
    </div>
  )
}

export function RequestDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const query = useQuery({
    queryKey: ['request', id],
    queryFn: () => getRequest(id!),
    enabled: Boolean(id),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['request', id] })
    void queryClient.invalidateQueries({ queryKey: ['requests'] })
  }

  const accept = useMutation({
    mutationFn: () => acceptRequest(id!),
    onSuccess: () => { toast.success(t('request.accept')); invalidate() },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('common.error')),
  })
  const complete = useMutation({
    mutationFn: () => completeRequest(id!),
    onSuccess: () => { toast.success(t('request.markComplete')); invalidate() },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('common.error')),
  })
  const cancel = useMutation({
    mutationFn: () => cancelRequest(id!),
    onSuccess: () => { toast.success(t('request.cancel')); invalidate() },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('common.error')),
  })

  if (query.isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>
  if (query.isError) {
    return (
      <p className="text-destructive">
        {query.error instanceof Error ? query.error.message : t('common.error')}
      </p>
    )
  }
  const req = query.data
  if (!req) return null

  const isRequester = userId === req.requester.id
  const isHelper = userId !== undefined && userId === req.helper?.id
  const isParticipant = isRequester || isHelper

  const showAccept = req.status === 'open' && !isRequester
  const showSchedule = req.status === 'accepted' && isParticipant
  const showComplete = req.status === 'accepted' && isParticipant
  const showCancel = isRequester && (req.status === 'open' || req.status === 'accepted')
  const anyAction = showAccept || showSchedule || showComplete || showCancel
  const busy = accept.isPending || complete.isPending || cancel.isPending

  const { variant: statusVariant, Icon: StatusIcon } = statusMeta[req.status]
  const requesterInitials = req.requester.display_name.slice(0, 2).toUpperCase()
  const helperInitials = req.helper?.display_name.slice(0, 2).toUpperCase()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('request.back')}
      </button>

      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b border-border/60 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {t(`subjects.${req.subject}`, { defaultValue: req.subject })}
                {req.topic ? <span className="text-muted-foreground"> · {req.topic}</span> : null}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <GraduationCap className="size-3.5" />
                  {t(`grades.${req.grade}`, { defaultValue: req.grade })}
                </span>
                <span className="inline-flex items-center gap-1 capitalize">
                  <ModeIcon mode={req.mode} />
                  {t(`request.${req.mode}`)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {new Date(req.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            <Badge variant={statusVariant} className="gap-1 capitalize">
              <StatusIcon className="size-3" />
              {t(`status.${req.status}`)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{req.description}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow Icon={Users} label={t('request.requester')}>
              <div className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="bg-brand-100 text-[10px] font-semibold text-brand-700">
                    {requesterInitials}
                  </AvatarFallback>
                </Avatar>
                <span>{req.requester.display_name}</span>
              </div>
            </InfoRow>
            <InfoRow Icon={Users} label={t('request.helper')}>
              {req.helper ? (
                <div className="flex items-center gap-2">
                  <Avatar className="size-6">
                    <AvatarFallback className="bg-brand-100 text-[10px] font-semibold text-brand-700">
                      {helperInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span>{req.helper.display_name}</span>
                </div>
              ) : (
                <span className="text-muted-foreground">{t('request.notYet')}</span>
              )}
            </InfoRow>
            {req.scheduled_at && (
              <InfoRow Icon={CalendarClock} label={t('request.scheduledAt')}>
                {new Date(req.scheduled_at).toLocaleString()}
              </InfoRow>
            )}
            {req.meeting_info && (
              <div className="sm:col-span-2">
                <InfoRow Icon={MapPin} label={t('request.meetingInfo')}>
                  <span className="whitespace-pre-wrap">{req.meeting_info}</span>
                </InfoRow>
              </div>
            )}
          </div>

          {req.status === 'completed' && (
            <>
              <Separator />
              <FeedbackSection requestId={req.id} canLeaveFeedback={isParticipant} />
            </>
          )}

          {anyAction && (
            <>
              <Separator />
              <div className="flex flex-wrap justify-end gap-2">
                {showAccept && (
                  <Button disabled={busy} onClick={() => accept.mutate()}>
                    {accept.isPending ? '…' : t('request.accept')}
                  </Button>
                )}
                {showSchedule && (
                  <Button variant="outline" disabled={busy} onClick={() => setScheduleOpen(true)}>
                    <CalendarClock className="size-4" />
                    {t('request.schedule')}
                  </Button>
                )}
                {showComplete && (
                  <Button disabled={busy} onClick={() => complete.mutate()}>
                    <CheckCircle2 className="size-4" />
                    {complete.isPending ? '…' : t('request.markComplete')}
                  </Button>
                )}
                {showCancel && (
                  <Button variant="destructive" disabled={busy} onClick={() => cancel.mutate()}>
                    {cancel.isPending ? '…' : t('request.cancel')}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        requestId={req.id}
        initialScheduledAt={req.scheduled_at}
        initialMeetingInfo={req.meeting_info}
        onSuccess={invalidate}
      />
    </div>
  )
}

function ScheduleDialog({
  open,
  onOpenChange,
  requestId,
  initialScheduledAt,
  initialMeetingInfo,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
  initialScheduledAt: string | null
  initialMeetingInfo: string | null
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const [when, setWhen] = useState(toLocalInputValue(initialScheduledAt))
  const [info, setInfo] = useState(initialMeetingInfo ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      scheduleRequest(requestId, {
        scheduled_at: new Date(when).toISOString(),
        meeting_info: info.trim(),
      }),
    onSuccess: () => {
      toast.success(t('request.schedule'))
      onSuccess()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('common.error')),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('request.scheduleTitle')}</DialogTitle>
          <DialogDescription>{t('request.meetingInfoHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scheduledAt">{t('request.scheduledAt')}</Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meetingInfo">{t('request.meetingInfo')}</Label>
            <Textarea
              id="meetingInfo"
              value={info}
              onChange={(e) => setInfo(e.target.value)}
              required
              minLength={1}
              maxLength={500}
              rows={3}
              placeholder={t('request.meetingInfoPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending || !when || !info.trim()}>
              {mutation.isPending ? '…' : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CalendarDays, CircleDot, MapPin, Video } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { RequestRead } from '@/api/requests'
import { displayStatus, statusIcon } from '@/lib/requestStatus'

function ModeIcon({ mode }: { mode: RequestRead['mode'] }) {
  if (mode === 'online') return <Video className="size-3.5" />
  if (mode === 'offline') return <MapPin className="size-3.5" />
  return <CircleDot className="size-3.5" />
}

export function RequestCard({ request }: { request: RequestRead }) {
  const { t } = useTranslation()
  const when = new Date(request.created_at).toLocaleDateString()
  const status = displayStatus(request)
  const Icon = statusIcon[status]
  const requesterInitials = request.requester.display_name.slice(0, 2).toUpperCase()

  return (
    <Link to={`/requests/${request.id}`} className="group block focus:outline-none">
      <Card
        className={cn(
          'h-full gap-3 py-5 transition-all duration-200',
          'group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-soft-lg',
          'group-focus-visible:ring-2 group-focus-visible:ring-primary/50',
        )}
      >
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">
              {t(`subjects.${request.subject}`, { defaultValue: request.subject })}
              {request.topic ? (
                <span className="text-muted-foreground"> · {request.topic}</span>
              ) : null}
            </CardTitle>
            <Badge variant={status} className="shrink-0 gap-1 capitalize">
              <Icon className="size-3" />
              {t(`status.${status}`)}
            </Badge>
          </div>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-brand-600" />
              {t(`grades.${request.grade}`, { defaultValue: request.grade })}
            </span>
            <span className="inline-flex items-center gap-1 capitalize">
              <ModeIcon mode={request.mode} />
              {t(`request.${request.mode}`)}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {when}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-sm text-muted-foreground">{request.description}</p>
          <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <Avatar className="size-6">
              <AvatarFallback className="bg-brand-100 text-[10px] font-semibold text-brand-700">
                {requesterInitials}
              </AvatarFallback>
            </Avatar>
            <span>
              <span className="font-medium text-foreground">
                {request.requester.display_name}
              </span>
              {request.helper ? (
                <>
                  {' '}· helper{' '}
                  <span className="font-medium text-foreground">
                    {request.helper.display_name}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, MessageCircle, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { listMessages, sendMessage, type MessageRead } from '@/api/messages'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

// New messages from the other side are picked up by polling.
const POLL_MS = 3000
// Show a time divider when this much time passed since the previous message.
const TIME_GAP_MS = 5 * 60_000

interface Outgoing {
  tempId: string
  body: string
  created_at: string
  // The server's copy once sent; kept until a poll returns it, so a poll that
  // started before the send finished can't make the message blink out.
  sent?: MessageRead
}

interface Bubble {
  key: string
  body: string
  created_at: string
  mine: boolean
  name: string
  sending: boolean
}

export function RequestChat({ requestId, canSend }: { requestId: string; canSend: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const myName = (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? ''
  const queryKey = ['request-messages', requestId]

  const messages = useQuery({
    queryKey,
    queryFn: () => listMessages(requestId),
    refetchInterval: POLL_MS,
  })

  const [body, setBody] = useState('')
  const [outgoing, setOutgoing] = useState<Outgoing[]>([])

  // Your own message shows up immediately ("sending…") and turns solid once
  // the server has it; on failure it is removed and the text goes back in the box.
  const send = useMutation({
    mutationFn: (msg: Outgoing) => sendMessage(requestId, msg.body),
    onMutate: (msg) => {
      setOutgoing((list) => [...list, msg])
      setBody('')
    },
    onSuccess: (sent, msg) => {
      setOutgoing((list) => list.map((o) => (o.tempId === msg.tempId ? { ...o, sent } : o)))
      queryClient.setQueryData<MessageRead[]>(queryKey, (list) =>
        list && !list.some((m) => m.id === sent.id) ? [...list, sent] : list,
      )
    },
    onError: (err, msg) => {
      setOutgoing((list) => list.filter((o) => o.tempId !== msg.tempId))
      setBody((current) => current || msg.body)
      toast.error(err instanceof Error ? err.message : t('chat.sendFailed'))
    },
  })

  const server = messages.data ?? []
  const serverIds = new Set(server.map((m) => m.id))
  const bubbles: Bubble[] = [
    ...server.map((m) => ({
      key: m.id,
      body: m.body,
      created_at: m.created_at,
      mine: m.sender.id === user?.id,
      name: m.sender.display_name,
      sending: false,
    })),
    ...outgoing
      .filter((o) => !o.sent || !serverIds.has(o.sent.id))
      .map((o) => ({
        key: o.tempId,
        body: o.body,
        created_at: o.sent?.created_at ?? o.created_at,
        mine: true,
        name: myName,
        sending: !o.sent,
      })),
  ]

  // Keep the newest message in view.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [bubbles.length])

  const submit = () => {
    const text = body.trim()
    if (!text) return
    send.mutate({
      tempId: `pending-${Date.now()}`,
      body: text,
      created_at: new Date().toISOString(),
    })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  // Enter sends, Shift+Enter adds a line. Ignore Enter while an IME (pinyin)
  // is still composing, otherwise picking a candidate would send the message.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row items-center gap-3 border-b border-border/60 py-4">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <MessageCircle className="size-4.5" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{t('chat.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('chat.subtitle')}</p>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        <div
          ref={scrollRef}
          className="h-96 space-y-3 overflow-y-auto bg-muted/40 px-4 py-4 sm:px-6"
        >
          {messages.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : messages.isError ? (
            <p className="py-10 text-center text-sm text-destructive">
              {messages.error instanceof Error ? messages.error.message : t('common.error')}
            </p>
          ) : bubbles.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('chat.empty')}</p>
          ) : (
            bubbles.map((b, i) => {
              const prev = bubbles[i - 1]
              const showTime =
                !prev ||
                new Date(b.created_at).getTime() - new Date(prev.created_at).getTime() > TIME_GAP_MS
              return (
                <div key={b.key} className="space-y-3">
                  {showTime && (
                    <p className="text-center text-[11px] text-muted-foreground">
                      {new Date(b.created_at).toLocaleString([], {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  <div className={cn('flex items-start gap-2', b.mine && 'flex-row-reverse')}>
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback
                        className={cn(
                          'text-[11px] font-semibold',
                          b.mine
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-brand-100 text-brand-700',
                        )}
                      >
                        {b.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        'flex max-w-[75%] items-end gap-1.5',
                        b.mine && 'flex-row-reverse',
                      )}
                    >
                      <p
                        className={cn(
                          'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-xs',
                          b.mine
                            ? 'rounded-tr-sm bg-primary text-primary-foreground'
                            : 'rounded-tl-sm bg-card text-foreground ring-1 ring-border/60',
                          b.sending && 'opacity-60',
                        )}
                      >
                        {b.body}
                      </p>
                      {b.sending && (
                        <Loader2
                          className="mb-2 size-3.5 shrink-0 animate-spin text-muted-foreground"
                          aria-label={t('chat.sending')}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {canSend ? (
          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 border-t border-border/60 p-3 sm:px-6"
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('chat.placeholder')}
              maxLength={1000}
              rows={1}
              className="max-h-32 min-h-10 resize-none"
            />
            <Button type="submit" size="icon" disabled={!body.trim()} aria-label={t('chat.send')}>
              <SendHorizontal className="size-4" />
            </Button>
          </form>
        ) : (
          <p className="border-t border-border/60 px-6 py-3 text-center text-xs text-muted-foreground">
            {t('chat.readOnly')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { History, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { introHistory, saveIntro, type IntroKind } from '@/api/literature'
import { introQuery } from '@/lib/literature/queries'

const K = 'tools.literature'
const MAX = 500

// The introduction of a work or a #device, which anyone can edit. Every save is a new version;
// the history lists them and can bring an older one back (saved as the newest).
export function IntroBlock({
  kind,
  subject,
  compact = false,
}: {
  kind: IntroKind
  subject: string // the work's key, or the device's name
  compact?: boolean // in the narrow side panel
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { queryKey, queryFn } = introQuery(kind, subject)
  const intro = useQuery({ queryKey, queryFn })
  const [draft, setDraft] = useState<string | null>(null) // null: not editing
  const [showHistory, setShowHistory] = useState(false)
  const history = useQuery({
    queryKey: [...queryKey, 'history'],
    queryFn: () => introHistory(kind, subject),
    enabled: showHistory,
  })

  const save = useMutation({
    mutationFn: (body: string) => saveIntro(kind, subject, body),
    onSuccess: (read) => {
      queryClient.setQueryData(queryKey, read)
      void queryClient.invalidateQueries({ queryKey: [...queryKey, 'history'] })
      setDraft(null)
      toast.success(t(`${K}.introSaved`))
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })

  const current = intro.data?.current
  const text = current?.body ?? ''
  const date = (iso: string) => new Date(iso).toLocaleDateString()

  if (draft !== null) {
    return (
      <div className="space-y-2">
        <Textarea
          autoFocus
          value={draft}
          maxLength={MAX}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(
            kind === 'work' ? `${K}.introPlaceholderWork` : `${K}.introPlaceholderDevice`,
          )}
          className={compact ? 'min-h-28' : 'min-h-32'}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {[...draft].length} / {MAX}
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setDraft(null)}>
            {t(`${K}.cancel`)}
          </Button>
          <Button
            size="sm"
            disabled={save.isPending || draft.trim() === text}
            onClick={() => save.mutate(draft.trim())}
          >
            {t(`${K}.saveIntro`)}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {intro.isLoading ? null : text ? (
        <p className={cn('whitespace-pre-wrap leading-7', compact ? 'text-sm' : 'text-[15px]')}>
          {text}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(kind === 'work' ? `${K}.noIntroWork` : `${K}.noIntroDevice`)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {current && (
          <span>
            {t(`${K}.introEditedBy`, {
              name: current.editor.display_name,
              date: date(current.created_at),
            })}
          </span>
        )}
        <button
          type="button"
          onClick={() => setDraft(text)}
          className="inline-flex items-center gap-1 hover:text-primary"
        >
          <Pencil className="size-3.5" />
          {t(text ? `${K}.editIntro` : `${K}.writeIntro`)}
        </button>
        {(intro.data?.version_count ?? 0) > 1 && (
          <button
            type="button"
            aria-expanded={showHistory}
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1 hover:text-primary"
          >
            <History className="size-3.5" />
            {t(`${K}.introHistory`, { count: intro.data?.version_count })}
          </button>
        )}
      </div>
      {showHistory && (
        <ol className="space-y-2 rounded-xl border border-border/70 p-3">
          {(history.data ?? []).map((v, i) => (
            <li
              key={v.id}
              className="space-y-1 border-b border-border/50 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t(`${K}.introVersion`, { n: v.number })}
                </span>
                <span>
                  {v.editor.display_name} · {date(v.created_at)}
                </span>
                {i === 0 ? (
                  <span className="ml-auto">{t(`${K}.introCurrent`)}</span>
                ) : (
                  <button
                    type="button"
                    disabled={save.isPending}
                    onClick={() =>
                      window.confirm(t(`${K}.restoreIntroConfirm`, { n: v.number })) &&
                      save.mutate(v.body)
                    }
                    className="ml-auto inline-flex items-center gap-1 hover:text-primary"
                  >
                    <RotateCcw className="size-3.5" />
                    {t(`${K}.restoreIntro`)}
                  </button>
                )}
              </div>
              <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
                {v.body || t(`${K}.introEmptyVersion`)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

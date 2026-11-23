import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  COUNCIL_KEY,
  newCouncilCode,
  revokeCouncilCode,
  useCouncil,
  type CodeRole,
  type CouncilStatus,
} from '@/api/guide'

// On 「现任鲦行知」 on the badge wall: the president's two codes, 副会长码 and 传承码 (the latter
// from 10 months into the term). The two buttons sit at the bottom of the card (laid over it: the
// card itself is a button); each opens a panel below the card, over the next row, with the code
// and copy / again / cancel. The recipient redeems it with 「兑换勋章」 on their own badge wall.
export function CouncilCodes() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const council = useCouncil()
  const [open, setOpen] = useState<CodeRole | null>(null)
  const done = (s: CouncilStatus) => queryClient.setQueryData(COUNCIL_KEY, s)
  const fail = (e: Error) => toast.error(e.message)
  const make = useMutation({ mutationFn: newCouncilCode, onSuccess: done, onError: fail })
  const revoke = useMutation({
    mutationFn: revokeCouncilCode,
    onSuccess: (s) => {
      done(s)
      toast.success(t('council.codes.revoked'))
    },
    onError: fail,
  })
  const c = council.data
  if (c?.role !== 'president') return null
  const busy = make.isPending || revoke.isPending
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language)
  const locked = !c.handover_from || new Date(c.handover_from) > new Date()
  const code = open === 'president' ? c.president_code : open === 'vice' ? c.vice_code : null

  const toggle = (role: CodeRole) => setOpen((o) => (o === role ? null : role))

  return (
    <>
      <div className="absolute inset-x-5 bottom-5 grid grid-cols-2 gap-2">
        {(['vice', 'president'] as const).map((role) => (
          <Button
            key={role}
            size="sm"
            variant={open === role ? 'default' : 'outline'}
            onClick={() => toggle(role)}
          >
            <KeyRound className="size-3.5" />
            {t(`council.codes.${role}`)}
          </Button>
        ))}
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 space-y-2 rounded-2xl border bg-card p-3 text-sm shadow-lg animate-in fade-in slide-in-from-top-1">
          <p className="text-xs text-muted-foreground">
            {open === 'vice'
              ? t('council.codes.viceHint')
              : t('council.codes.presidentHint', { next: (c.term ?? 0) + 1 })}
          </p>
          {open === 'president' && locked ? (
            <p className="text-muted-foreground">
              {t('council.codes.locked', { date: c.handover_from ? date(c.handover_from) : '' })}
            </p>
          ) : code ? (
            <>
              <code className="block rounded-md bg-muted px-2.5 py-1.5 text-center font-mono tracking-wider">
                {code.code}
              </code>
              <div className="flex flex-wrap justify-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(code.code)
                      .then(() => toast.success(t('council.codes.copied')))
                  }
                >
                  <Copy className="size-3.5" />
                  {t('council.codes.copy')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => confirm(t('council.codes.regenerateConfirm')) && make.mutate(open)}
                >
                  {t('council.codes.regenerate')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => revoke.mutate(open)}
                >
                  {t('council.codes.revoke')}
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {t('council.codes.expires', { date: date(code.expires_at) })}
              </p>
            </>
          ) : (
            <Button
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => make.mutate(open)}
            >
              {t('council.codes.generate')}
            </Button>
          )}
        </div>
      )}
    </>
  )
}

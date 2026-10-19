import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { listNotices, markNoticesSeen } from '@/api/media'
import { useModerationAlert } from '@/store/moderationAlert'

// Red warning shown when the user's content is rejected on submit, or was
// taken down later by moderation (notices are polled from the backend).
export function ModerationAlert() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const open = useModerationAlert((s) => s.open)
  const show = useModerationAlert((s) => s.show)
  const hide = useModerationAlert((s) => s.hide)

  const notices = useQuery({
    queryKey: ['moderation-notices'],
    queryFn: listNotices,
    refetchInterval: 60_000,
  })
  const takenDown = notices.data?.length ?? 0

  useEffect(() => {
    if (takenDown > 0) show()
  }, [takenDown, show])

  const onClose = () => {
    hide()
    if (takenDown > 0) {
      void markNoticesSeen().then(() =>
        queryClient.invalidateQueries({ queryKey: ['moderation-notices'] }),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="border-2 border-red-500 bg-red-50 dark:bg-red-950">
        <DialogHeader className="items-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-red-600 text-white">
            <ShieldAlert className="size-7" />
          </span>
          <DialogTitle className="text-2xl font-extrabold text-red-600">
            {t('moderation.alertTitle')}
          </DialogTitle>
          <DialogDescription className="text-red-700 dark:text-red-200">
            {takenDown > 0
              ? t('moderation.takenDown', { count: takenDown })
              : t('moderation.rejected')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button className="bg-red-600 text-white hover:bg-red-700" onClick={onClose}>
            {t('moderation.ok')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ACCEPTED_IMAGES,
  ACCEPTED_VIDEOS,
  getMediaConfig,
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  uploadMedia,
  type MediaRead,
} from '@/api/media'
import { compressImage } from '@/lib/compressImage'

// Picks images / videos and uploads each one right away; the backend moderates
// it before storing. `value` holds the uploaded attachments.
export function MediaUploader({
  value,
  onChange,
  onUploadingChange,
}: {
  value: MediaRead[]
  onChange: (media: MediaRead[]) => void
  onUploadingChange?: (uploading: boolean) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const config = useQuery({ queryKey: ['media-config'], queryFn: getMediaConfig, staleTime: 5 * 60_000 })
  const videoEnabled = config.data?.video_enabled ?? true

  const setPending = (delta: number) =>
    setUploading((n) => {
      const next = n + delta
      onUploadingChange?.(next > 0)
      return next
    })

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    const room = MAX_ATTACHMENTS - value.length - uploading
    const picked = Array.from(files).slice(0, Math.max(room, 0))
    if (files.length > picked.length) toast.error(t('media.max', { count: MAX_ATTACHMENTS }))

    let current = value
    for (const original of picked) {
      const isVideo = original.type.startsWith('video/')
      if (isVideo && !videoEnabled) {
        toast.error(t('media.videoDisabled'))
        continue
      }
      const file = isVideo ? original : await compressImage(original)
      if (file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
        toast.error(t('media.tooLarge'))
        continue
      }
      setPending(1)
      try {
        const media = await uploadMedia(file)
        current = [...current, media]
        onChange(current)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('common.error'))
      } finally {
        setPending(-1)
      }
    }
  }

  return (
    <div className="space-y-2">
      {(value.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2">
          {value.map((m) => (
            <div key={m.id} className="relative size-20 overflow-hidden rounded-xl border border-border/60 bg-secondary">
              {m.kind === 'image' ? (
                <img src={m.url} alt="" className="size-full object-cover" />
              ) : (
                <video src={m.url} className="size-full object-cover" muted />
              )}
              <button
                type="button"
                aria-label={t('media.remove')}
                onClick={() => onChange(value.filter((x) => x.id !== m.id))}
                className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`pending-${i}`} className="grid size-20 place-items-center rounded-xl border border-dashed border-border text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={videoEnabled ? `${ACCEPTED_IMAGES},${ACCEPTED_VIDEOS}` : ACCEPTED_IMAGES}
        multiple
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={value.length + uploading >= MAX_ATTACHMENTS}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          {videoEnabled ? t('media.add') : t('media.addImage')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {uploading > 0
            ? t('media.uploading')
            : t(videoEnabled ? 'media.hint' : 'media.hintImages', { count: MAX_ATTACHMENTS })}
        </span>
      </div>
    </div>
  )
}

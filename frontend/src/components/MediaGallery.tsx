import type { MediaRead } from '@/api/media'
import { cn } from '@/lib/utils'

export function MediaGallery({ media, className }: { media: MediaRead[]; className?: string }) {
  if (media.length === 0) return null
  return (
    <div className={cn('grid gap-2', media.length > 1 && 'sm:grid-cols-2', className)}>
      {media.map((m) =>
        m.kind === 'image' ? (
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border/60 bg-secondary">
            <img src={m.url} alt="" loading="lazy" className="max-h-96 w-full object-contain" />
          </a>
        ) : (
          <video
            key={m.id}
            src={m.url}
            controls
            preload="metadata"
            className="max-h-96 w-full rounded-xl border border-border/60 bg-black"
          />
        ),
      )}
    </div>
  )
}

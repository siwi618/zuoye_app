import type { MediaRead } from '@/api/media'

// Small square preview of the first attached image, shown at the side of a list card.
// Videos are skipped; nothing renders when there is no image.
export function CardThumbnail({ media }: { media: MediaRead[] }) {
  const image = media.find((m) => m.kind === 'image')
  if (!image) return null

  return (
    <img
      src={image.url}
      alt=""
      loading="lazy"
      decoding="async"
      className="size-16 shrink-0 rounded-lg border border-border/60 bg-muted object-cover"
    />
  )
}

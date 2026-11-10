import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = { sm: 'size-4', md: 'size-5', lg: 'size-7' }

export function StarRating({ value, onChange, size = 'md', className }: StarRatingProps) {
  const readOnly = !onChange
  return (
    <div
      className={cn('flex gap-1', className)}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `${Number(value.toFixed(2))} stars` : undefined}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        if (readOnly) {
          // Filled as far as the value goes, so a score of 4.69 fills the fifth star 69%: a
          // filled star over an empty one, clipped to that width.
          const fill = Math.min(Math.max(value - (n - 1), 0), 1)
          return (
            <span key={n} className="relative inline-flex" aria-hidden>
              <Star className={cn(sizeMap[size], 'text-muted-foreground/40')} />
              <span
                className="absolute inset-y-0 left-0 flex overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className={cn(sizeMap[size], 'shrink-0 fill-amber-400 text-amber-400')} />
              </span>
            </span>
          )
        }
        const Icon = (
          <Star
            className={cn(
              sizeMap[size],
              n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
            )}
          />
        )
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-checked={n === value}
            role="radio"
            onClick={() => onChange(n)}
            className="cursor-pointer transition-transform hover:scale-110"
          >
            {Icon}
          </button>
        )
      })}
    </div>
  )
}

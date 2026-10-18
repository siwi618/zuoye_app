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
    <div className={cn('flex gap-1', className)} role={readOnly ? 'img' : 'radiogroup'}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value)
        const Icon = (
          <Star
            className={cn(
              sizeMap[size],
              filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
            )}
          />
        )
        if (readOnly) {
          return <span key={n} aria-label={`${value} stars`}>{Icon}</span>
        }
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

import { cn } from '@/lib/utils'

interface BrandProps {
  size?: 'sm' | 'md' | 'lg'
  withWordmark?: boolean
  className?: string
}

const markSize = { sm: 'size-7', md: 'size-9', lg: 'size-12' }
const textSize = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }

export function Brand({ size = 'md', withWordmark = true, className }: BrandProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <span
        className={cn(
          'relative grid place-items-center rounded-xl bg-gradient-to-br from-primary to-brand-600 text-primary-foreground shadow-soft',
          markSize[size],
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="size-1/2"
        >
          <path d="M4 6h10" />
          <path d="M4 12h7" />
          <path d="M4 18h10" />
          <circle cx="18" cy="12" r="2" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {withWordmark && (
        <span className={cn('font-semibold tracking-tight text-foreground', textSize[size])}>
          Zuoyebang
        </span>
      )}
    </span>
  )
}

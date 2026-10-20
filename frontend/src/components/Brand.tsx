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
        {/* Coral mark — same drawing as public/favicon.svg */}
        <svg viewBox="0 0 64 64" fill="none" aria-hidden className="size-[70%]">
          <g stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M32 58V13" />
            <path d="M32 45c0-8-12-7-12-18v-6" />
            <path d="M32 40c0-8 12-7 12-18v-6" />
            <path d="M32 52c0-6-21-5-21-17v-1" />
            <path d="M32 49c0-6 21-5 21-17v-1" />
          </g>
          <g fill="currentColor">
            <circle cx="32" cy="11" r="4.6" />
            <circle cx="20" cy="19" r="4.6" />
            <circle cx="44" cy="14" r="4.6" />
            <circle cx="11" cy="31" r="4" />
            <circle cx="53" cy="29" r="4" />
          </g>
        </svg>
      </span>
      {withWordmark && (
        <span className={cn('font-semibold tracking-tight text-foreground', textSize[size])}>
          Coral <span className="text-primary">Study</span>
        </span>
      )}
    </span>
  )
}

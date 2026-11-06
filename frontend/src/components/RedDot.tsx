import { cn } from '@/lib/utils'

// The small red dot that flags something new, e.g. a badge not seen yet.
export function RedDot({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      className={cn('size-2.5 rounded-full bg-red-500 ring-2 ring-background', className)}
    />
  )
}

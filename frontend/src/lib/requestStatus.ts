import { CheckCircle2, CircleDot, Clock, Star, XCircle } from 'lucide-react'
import type { RequestRead } from '@/api/requests'

// What a request's badge shows. "review" (待评价) isn't stored: it's a
// completed request the viewer took part in and hasn't rated yet.
export type DisplayStatus = 'open' | 'accepted' | 'review' | 'completed' | 'cancelled'

// Badge variants share these names (components/ui/badge.tsx).
export const statusIcon: Record<DisplayStatus, typeof CircleDot> = {
  open: CircleDot,
  accepted: Clock,
  review: Star,
  completed: CheckCircle2,
  cancelled: XCircle,
}

export function displayStatus(request: RequestRead): DisplayStatus {
  return request.awaiting_my_review ? 'review' : request.status
}

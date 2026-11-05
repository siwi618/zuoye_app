import { queryOptions, useQueryClient } from '@tanstack/react-query'
import { getDevice, getIntro, getWork, type IntroKind } from '@/api/literature'
import { analysesQuery } from './analysisList'
import { recall } from './deviceMemory'

// The queries behind the work and device pages, shared by the pages and by prefetching.
export const workQuery = (key: string) =>
  queryOptions({ queryKey: ['literature-work', key], queryFn: () => getWork(key) })
export const deviceQuery = (name: string) =>
  queryOptions({
    queryKey: ['literature-device', name.toLowerCase()],
    queryFn: () => getDevice(name),
  })
export const introQuery = (kind: IntroKind, subject: string) =>
  queryOptions({
    queryKey: ['literature-intro', kind, subject.toLowerCase()],
    queryFn: () => getIntro(kind, subject),
  })

const HOVER_DELAY = 80 // ms: a pointer only passing over a row doesn't fetch anything

// Starts loading a page's data while the pointer rests on (or a finger touches, or the keyboard
// reaches) a link to it, so the page opens with its data already there. Spread onto the link.
export function usePrefetch() {
  const queryClient = useQueryClient()
  const work = (key: string) => {
    void queryClient.prefetchQuery(workQuery(key))
    void queryClient.prefetchInfiniteQuery(analysesQuery(key, { sort: 'hot' }))
    void queryClient.prefetchQuery(introQuery('work', key))
  }
  // A device page shows `work` (else the one last shown there, else the most used) and the
  // work remembered for its right card.
  const device = (name: string, work?: string | null) => {
    const cards = (key: string | null | undefined) => {
      if (key)
        void queryClient.prefetchInfiniteQuery(analysesQuery(key, { sort: 'hot', tag: name }))
    }
    void queryClient.prefetchQuery(introQuery('device', name))
    const left = work ?? recall('work')
    if (left === undefined)
      queryClient
        .fetchQuery(deviceQuery(name))
        .then((d) => cards(d.works[0]?.work_key))
        .catch(() => {}) // the page will show the error if it is still there
    else {
      void queryClient.prefetchQuery(deviceQuery(name))
      cards(left)
    }
    if (recall('compare') !== left) cards(recall('compare'))
  }
  const on = (run: () => void) => {
    let timer = 0
    return {
      onMouseEnter: () => (timer = window.setTimeout(run, HOVER_DELAY)),
      onMouseLeave: () => window.clearTimeout(timer),
      onFocus: run,
      onTouchStart: run,
    }
  }
  return {
    work: (key: string) => on(() => work(key)),
    device: (name: string, workKey?: string | null) => on(() => device(name, workKey)),
  }
}

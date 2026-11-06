import { queryOptions, useQuery } from '@tanstack/react-query'
import { listWorks, type Work } from '@/api/literature'

export type { Work }

// The works of the literature tool (the sphere's outer shell), from the server; holders of the
// 「鱼果」 badge can add more. Everything students add to a work — quotes, #device tags,
// analyses — lives in the database under the work's key.
//
// The last list fetched is kept in this browser, so on later visits the pages show it at once
// while the current one loads.
const CACHE = 'coral.literature.works'
let known: Work[] | undefined = (() => {
  try {
    const raw = localStorage.getItem(CACHE)
    return raw ? (JSON.parse(raw) as Work[]) : undefined
  } catch {
    return undefined
  }
})()

export const worksQuery = queryOptions({
  queryKey: ['literature-works'],
  queryFn: async () => {
    const works = await listWorks()
    known = works
    try {
      localStorage.setItem(CACHE, JSON.stringify(works))
    } catch {
      // storage unavailable: nothing is kept
    }
    return works
  },
  initialData: () => known,
  initialDataUpdatedAt: 0, // kept from an earlier visit: always fetch the current list
  staleTime: 60_000,
})

// `ready` is false only on a first visit, until the list arrives.
export function useWorks() {
  const q = useQuery(worksQuery)
  const works = q.data
  return {
    works: works ?? [],
    ready: works !== undefined,
    error: q.error,
    find: (key: string | null | undefined) => works?.find((w) => w.key === key),
  }
}

// Outside components: the last list known in this browser (undefined before the first one).
export const knownWorks = () => known
export const findWork = (key: string | null | undefined) => known?.find((w) => w.key === key)

// 「阿城 · 1984」; the year is left out when unknown.
export const workByline = (w: Work) => (w.year != null ? `${w.author} · ${w.year}` : w.author)

// A work's own page; with `tag`, its analyses are filtered to that #tag.
export const workPath = (key: string, tag?: string) =>
  `/tools/literature/works/${key}${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`

// A #device's own page; `work` (right half) and `compare` (left half) pick the works whose
// analyses using it are listed side by side.
export const devicePath = (name: string, work?: string | null, compare?: string | null) => {
  const q = new URLSearchParams()
  if (work) q.set('work', work)
  if (compare) q.set('compare', compare)
  const qs = q.toString()
  return `/tools/literature/devices/${encodeURIComponent(name)}${qs ? `?${qs}` : ''}`
}

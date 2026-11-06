import { findWork, knownWorks } from './corpus'

// The works last shown on a device page, remembered in this browser for the next one.
// `work` is the left card, `compare` the right one; an empty value means the card was closed.
export type Side = 'work' | 'compare'
const MEMORY: Record<Side, string> = {
  work: 'coral.literature.deviceWork',
  compare: 'coral.literature.deviceCompare',
}
// undefined: nothing remembered yet; null: remembered as closed.
export const recall = (side: Side): string | null | undefined => {
  try {
    const key = localStorage.getItem(MEMORY[side])
    if (key === null) return undefined
    if (!key) return null
    // Before the works list has ever loaded here, it can't be checked yet.
    return !knownWorks() || findWork(key) ? key : null
  } catch {
    return undefined
  }
}
export const remember = (side: Side, key: string | null) => {
  try {
    localStorage.setItem(MEMORY[side], key ?? '')
  } catch {
    // storage unavailable: nothing is remembered
  }
}

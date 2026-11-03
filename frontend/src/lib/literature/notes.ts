import { useCallback, useState } from 'react'

// A student's own additions to a (work, device) analysis. Kept in this browser only for now;
// whether supplements should live in the account is still open (Ken, 2026-11-03).
const STORAGE_KEY = 'coral.literature.notes.v1'

function load(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function useNotes() {
  const [notes, setNotes] = useState(load)
  const setNote = useCallback((key: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev }
      if (text.trim()) next[key] = text
      else delete next[key]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Private mode or storage full: the note just is not kept.
      }
      return next
    })
  }, [])
  return { notes, setNote }
}

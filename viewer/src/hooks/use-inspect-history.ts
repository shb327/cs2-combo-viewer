import { useCallback } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'

export interface InspectHistoryEntry {
  link: string
  at: number
}


const HISTORY_MAX = 60


export function useInspectHistory() {
  const [entries, setEntries] = useLocalStorage<InspectHistoryEntry[]>('inspect-history', [])
  const add = useCallback((link: string) => {
    const trimmed = link.trim()
    if (!trimmed) return
    setEntries((prev) => [{ link: trimmed, at: Date.now() }, ...prev.filter((e) => e.link !== trimmed)].slice(0, HISTORY_MAX))
  }, [setEntries])
  const remove = useCallback((link: string) => setEntries((prev) => prev.filter((e) => e.link !== link)), [setEntries])
  const clear = useCallback(() => setEntries([]), [setEntries])
  return { entries, add, remove, clear }
}

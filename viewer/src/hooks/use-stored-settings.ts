import { useCallback } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'

/**
 * A settings object kept in localStorage, updated by patches: `set({ a: 1 })` changes `a` and keeps the rest.
 * @param key the storage key (see useLocalStorage)
 * @param defaults every setting's default (also fills in settings missing from what was stored)
 */
export function useStoredSettings<T extends object>(key: string, defaults: T): [T, (changes: Partial<T>) => void] {
  const [value, setValue] = useLocalStorage<T>(key, defaults)
  const patch = useCallback((changes: Partial<T>) => setValue((prev) => ({ ...prev, ...changes })), [setValue])
  return [value, patch]
}

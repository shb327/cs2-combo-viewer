import { useCallback, useEffect, useRef, useState } from 'react'

const PREFIX = '3dviewer:'
/** Fired on window when a key is written, so other hooks on the same key in this tab follow (`storage` only reaches other tabs). */
const LOCAL_EVENT = '3dviewer:storage'

type Updater<T> = T | ((prev: T) => T)

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const stored = JSON.parse(raw) as unknown
    // Objects are merged over the defaults, so a setting added later still gets its default value.
    if (isPlainObject(fallback) && isPlainObject(stored)) return { ...fallback, ...stored } as T
    return typeof stored === typeof fallback ? (stored as T) : fallback
  } catch {
    return fallback // storage unavailable (private mode) or bad data
  }
}

/**
 * A piece of state kept in localStorage (under "3dviewer:<key>"): a per-browser preference such as the lighting,
 * the viewmodel or which panels are open — not part of the shareable link. Every hook on the same key follows the
 * others, in this tab and in other tabs.
 * @param key the storage key (without the prefix)
 * @param initial the default value
 */
export function useLocalStorage<T>(key: string, initial: T | (() => T)): [T, (next: Updater<T>) => void] {
  const fallback = useRef(initial)
  const resolveFallback = () => (typeof fallback.current === 'function' ? (fallback.current as () => T)() : fallback.current)
  const [value, setValue] = useState<T>(() => read(key, resolveFallback()))
  const current = useRef(value)
  current.current = value

  const set = useCallback((next: Updater<T>) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(current.current) : next
    current.current = resolved
    setValue(resolved)
    try { localStorage.setItem(PREFIX + key, JSON.stringify(resolved)) } catch { /* not remembered */ }
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: key }))
  }, [key])

  useEffect(() => {
    const reload = () => setValue(read(key, resolveFallback()))
    const onStorage = (e: StorageEvent) => { if (e.key === PREFIX + key) reload() }
    const onLocal = (e: Event) => { if ((e as CustomEvent<string>).detail === key) reload() }
    window.addEventListener('storage', onStorage)
    window.addEventListener(LOCAL_EVENT, onLocal)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LOCAL_EVENT, onLocal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, set]
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

/** Search-param changes: a value of null removes the param. */
export type Patch = Record<string, string | number | null>

/** How long the state has to stay still before it is written to the URL (ms). */
const URL_WRITE_DELAY = 200

const asParam = (value: string | number | null) => (value === null || value === '' ? null : String(value))

/**
 * Search params that change at once and reach the URL later. Changes land here first (an urgent React update) and
 * are written to the URL only once things have been still for URL_WRITE_DELAY: React Router writes the URL in a
 * transition, and every slider move used to restart that transition — the whole page re-rendered after each move
 * and, on a heavy page, the drag stalled.
 * @returns the current params (with the changes not yet written) and `patch`, which changes them
 */
export function useLiveSearchParams(): [URLSearchParams, (changes: Patch) => void] {
  const [urlParams, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const [live, setLive] = useState<Patch>({})
  const pending = useRef<Patch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const writeUrl = useCallback(() => {
    timer.current = null
    const changes = pending.current
    pending.current = {}
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        const param = asParam(value)
        if (param === null) next.delete(key)
        else next.set(key, param)
      }
      return next
    }, { replace: true })
  }, [setParams])

  const patch = useCallback((changes: Patch) => {
    setLive((prev) => ({ ...prev, ...changes }))
    pending.current = { ...pending.current, ...changes }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(writeUrl, URL_WRITE_DELAY)
  }, [writeUrl])

  /** A new item (path) starts from its own URL: drop what was still waiting for the old one. */
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = {}
    setLive({})
  }, [pathname])

  /** Once the URL has caught up, the live copy of those keys is no longer needed. */
  useEffect(() => {
    setLive((prev) => {
      const keys = Object.keys(prev).filter((key) => urlParams.get(key) === asParam(prev[key]) && !(key in pending.current))
      if (!keys.length) return prev
      const next = { ...prev }
      for (const key of keys) delete next[key]
      return next
    })
  }, [urlParams])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const params = useMemo(() => {
    if (!Object.keys(live).length) return urlParams
    const merged = new URLSearchParams(urlParams)
    for (const [key, value] of Object.entries(live)) {
      const param = asParam(value)
      if (param === null) merged.delete(key)
      else merged.set(key, param)
    }
    return merged
  }, [urlParams, live])

  return [params, patch]
}

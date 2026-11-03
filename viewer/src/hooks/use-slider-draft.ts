import { useCallback, useEffect, useRef, useState } from 'react'

/** The shortest gap between two pushes while dragging (ms). The thumb itself follows the pointer every frame. */
const PUSH_INTERVAL = 60
/** The longest gap, however slow a push is. */
const MAX_INTERVAL = 400
const FRAME = 1000 / 60

/**
 * Decouples a slider from what its value drives. While dragging, the thumb follows a local draft, and the value
 * goes out to `onChange` now and then — never sooner than three times what the previous push cost (measured up to the
 * next frame, so it includes the re-render and the viewer's work) — and once more on release. Without it every pointer move
 * rewrote the URL, re-rendered the page and rebuilt stickers / charms in the viewer; when that took longer than a
 * frame the drag stalled.
 * @param value the committed value (from the URL state)
 * @param onChange where the value goes
 */
export function useSliderDraft(value: number, onChange: (value: number) => void) {
  const [draft, setDraft] = useState<number | null>(null)
  const onChangeRef = useRef(onChange)
  const lastPush = useRef(0)
  const interval = useRef(PUSH_INTERVAL)
  const pending = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { onChangeRef.current = onChange })
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const flush = useCallback(() => {
    timer.current = null
    if (pending.current === null) return
    const start = performance.now()
    lastPush.current = start
    onChangeRef.current(pending.current)
    pending.current = null
    // Two frames: React renders a pointermove update in a later task, so the first frame can come before it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const cost = performance.now() - start - FRAME
      interval.current = Math.min(MAX_INTERVAL, Math.max(PUSH_INTERVAL, cost * 3))
    }))
  }, [])

  const onValueChange = useCallback((next: number | readonly number[]) => {
    const v = Array.isArray(next) ? next[0] : (next as number)
    setDraft(v)
    pending.current = v
    const wait = interval.current - (performance.now() - lastPush.current)
    if (wait <= 0) flush()
    else if (!timer.current) timer.current = setTimeout(flush, wait)
  }, [flush])

  const onValueCommitted = useCallback((next: number | readonly number[]) => {
    const v = Array.isArray(next) ? next[0] : (next as number)
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
    lastPush.current = performance.now()
    onChangeRef.current(v)
    setDraft(null)
  }, [])

  return { value: draft ?? value, onValueChange, onValueCommitted }
}

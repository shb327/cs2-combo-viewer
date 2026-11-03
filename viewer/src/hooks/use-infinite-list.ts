import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Renders a long list a page at a time: `count` grows by `pageSize` whenever the sentinel element comes within
 * `margin` of the scroll container's viewport. Changing `resetKey` starts over from the first page.
 * @param total how many items there are
 * @param resetKey anything that changes the list (filters, search)
 * @param root the scroll container
 */
export function useInfiniteList(total: number, resetKey: unknown, root: RefObject<HTMLElement | null>, pageSize = 60, margin = '800px') {
  const [count, setCount] = useState(pageSize)
  const observer = useRef<IntersectionObserver | null>(null)

  useEffect(() => { setCount(pageSize) }, [resetKey, pageSize])

  const sentinel = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return
    observer.current = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setCount((c) => c + pageSize) },
      { root: root.current, rootMargin: margin },
    )
    observer.current.observe(node)
  }, [root, pageSize, margin])

  useEffect(() => () => observer.current?.disconnect(), [])

  return { count: Math.min(count, total), hasMore: count < total, sentinel }
}

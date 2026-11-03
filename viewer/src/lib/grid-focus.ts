/** The cards keyboard focus moves between (marked with this attribute). */
export const GRID_ITEM = 'data-grid-item'

const STEP: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * Moves the focus from `from` to the nearest grid card in the arrow key's direction (by their places on screen, so it
 * works across groups and any number of columns) and scrolls it into view.
 * @returns whether the key was an arrow that moved the focus
 */
export function moveGridFocus(container: HTMLElement, from: HTMLElement, key: string): boolean {
  const step = STEP[key]
  if (!step) return false
  const [dx, dy] = step
  const a = from.getBoundingClientRect()
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2
  let best: HTMLElement | null = null, bestScore = Infinity
  for (const el of container.querySelectorAll<HTMLElement>(`[${GRID_ITEM}]`)) {
    if (el === from) continue
    const b = el.getBoundingClientRect()
    const along = ((b.left + b.width / 2 - ax) * dx + (b.top + b.height / 2 - ay) * dy)
    const across = Math.abs((b.left + b.width / 2 - ax) * dy) + Math.abs((b.top + b.height / 2 - ay) * dx)
    if (along <= 1) continue
    // (straight ahead beats diagonal: the sideways offset counts more)
    const score = along + across * 3
    if (score < bestScore) { bestScore = score; best = el }
  }
  if (!best) return false
  best.focus({ preventScroll: true })
  best.scrollIntoView({ block: 'nearest' })
  return true
}

/** Focuses the first grid card in `container`; whether there was one. */
export function focusFirstGridItem(container: HTMLElement | null): boolean {
  const first = container?.querySelector<HTMLElement>(`[${GRID_ITEM}]`)
  if (!first) return false
  first.focus()
  return true
}

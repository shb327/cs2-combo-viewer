import type { PointerEvent } from 'react'

/** How far (degrees) a card leans at its edge. */
const MAX_TILT = 10

/** Leans a card toward the mouse and moves its sheen (the --rx / --ry / --mx / --my vars read by tilt-card in index.css). */
function onPointerMove(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  el.style.setProperty('--ry', `${(x - 0.5) * 2 * MAX_TILT}deg`)
  el.style.setProperty('--rx', `${(0.5 - y) * 2 * MAX_TILT}deg`)
  el.style.setProperty('--mx', `${x * 100}%`)
  el.style.setProperty('--my', `${y * 100}%`)
}

function onPointerLeave(e: PointerEvent<HTMLElement>) {
  e.currentTarget.style.setProperty('--rx', '0deg')
  e.currentTarget.style.setProperty('--ry', '0deg')
}

/** The pointer handlers that make an element with the tilt-card class lean toward the mouse. */
export const tiltHandlers = { onPointerMove, onPointerLeave }

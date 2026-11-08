/**
 * Messages that arrive before the embed's page is ready to handle them (its code is loaded on demand): kept from the
 * first module on, so a parent that sends a command at the iframe's `load` event doesn't lose it. The page takes them
 * over with `takeMessages`; until then at most 50 are held.
 */
const held: MessageEvent[] = []
let handler: ((e: MessageEvent) => void) | null = null

window.addEventListener('message', (e) => {
  if (handler) handler(e)
  else if (held.length < 50) held.push(e)
})

/** Hands every message, the held ones first, to `h`; returns the release. */
export function takeMessages(h: (e: MessageEvent) => void): () => void {
  handler = h
  for (const e of held.splice(0)) h(e)
  return () => { if (handler === h) handler = null }
}

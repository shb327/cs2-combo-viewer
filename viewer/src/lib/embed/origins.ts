/**
 * Which pages may talk to the embed, and where its events go (docs/embed.md, "Origins").
 *
 * Messages are accepted only from these origins, and events are posted only to the parent page's origin when it is one
 * of them, never to '*'. The same sites are the only ones allowed to frame the viewer (frame-ancestors in
 * public/_headers).
 */
const SITES = ['https://combo.skin', 'https://view.combo.skin', 'https://admin.combo.skin']

/**
 * Local ports: Combo Skin's site (5173 dev, 4173 preview), its admin dashboard (5174), this viewer (5320 dev,
 * 5321 preview) and the test page (5322).
 */
const LOCAL_PORTS = [5173, 4173, 5174, 5320, 5321, 5322]

export const ALLOWED_ORIGINS: readonly string[] = [
  ...SITES,
  ...LOCAL_PORTS.flatMap((port) => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]),
]

export const isAllowedOrigin = (origin: string | null | undefined): origin is string => !!origin && ALLOWED_ORIGINS.includes(origin)

const originOf = (url: string): string | null => {
  try { return new URL(url).origin } catch { return null }
}

/**
 * The parent page's origin, if it is allowed: `location.ancestorOrigins` (Chrome, Safari), else the referrer (the
 * parent's origin under the default referrer policy). Not framed: the page's own origin (a page driving itself, as the
 * pipeline's checks do). Null when neither says: then the first allowed message decides (see `learnParentOrigin`).
 */
function detectParentOrigin(): string | null {
  if (window.top === window) return window.location.origin
  const ancestor = window.location.ancestorOrigins?.[0]
  if (isAllowedOrigin(ancestor)) return ancestor
  const referrer = document.referrer ? originOf(document.referrer) : null
  return isAllowedOrigin(referrer) ? referrer : null
}

let parentOrigin: string | null = detectParentOrigin()
const waiting: Array<(origin: string) => void> = []

/** The parent's origin once known. */
export const knownParentOrigin = (): string | null => parentOrigin

/**
 * Called for every message that passed the origin check: the first one from the parent tells its origin when the
 * page couldn't (Firefox has no ancestorOrigins; a parent with `Referrer-Policy: no-referrer` sends no referrer).
 */
export function learnParentOrigin(e: MessageEvent): void {
  if (parentOrigin || e.source !== window.parent || !isAllowedOrigin(e.origin)) return
  parentOrigin = e.origin
  for (const resolve of waiting.splice(0)) resolve(e.origin)
}

/** Resolves with the parent's origin as soon as it is known. */
export function whenParentOrigin(): Promise<string> {
  return parentOrigin ? Promise.resolve(parentOrigin) : new Promise((resolve) => waiting.push(resolve))
}

/** The DOM event an embed that isn't framed dispatches on its own window for each of its messages (`detail`). */
export const SELF_EVENT = 'cs3d'

/**
 * Posts to the parent page, only to its own (allowed) origin; nothing when that isn't known. Not framed (the
 * screenshot worker drives the page itself): dispatched on the page's own window as a `cs3d` event instead, never posted.
 */
export function postToParent(data: unknown): boolean {
  if (window.parent === window) {
    window.dispatchEvent(new CustomEvent(SELF_EVENT, { detail: data }))
    return true
  }
  if (!parentOrigin) return false
  window.parent.postMessage(data, parentOrigin)
  return true
}

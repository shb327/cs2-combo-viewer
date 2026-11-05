import * as THREE from 'three'

/**
 * How far the current load is: the files three.js' loaders (models, textures, the environment) have finished out of
 * those they've started since the load began, through its default loading manager (whose counts run on across loads).
 * Files are discovered as the load goes, so the share can drop; what is reported never goes back.
 */
type Listener = (share: number) => void
const listeners = new Set<Listener>()
let started = 0
let finished = 0
let base = 0
let shown = 0

function notify(): void {
  const share = started > base ? (finished - base) / (started - base) : 0
  shown = Math.max(shown, Math.min(share, 0.98))
  for (const l of listeners) l(shown)
}

const manager = THREE.DefaultLoadingManager
manager.onStart = (_url, loaded, total) => { finished = loaded; started = total; notify() }
manager.onProgress = (_url, loaded, total) => { finished = loaded; started = total; notify() }

/** Follows the load's progress (0 to 1); returns the unsubscribe. */
export function onLoadProgress(listener: Listener): () => void {
  listeners.add(listener)
  listener(shown)
  return () => { listeners.delete(listener) }
}

/** Counts from here (a new item starts loading). */
export function resetLoadProgress(): void {
  base = finished
  shown = 0
  notify()
}

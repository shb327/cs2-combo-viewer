// The publish step of hosting.mjs: the bucket's layout, staged locally (work/hosting/publish/), so the upload is a plain
// copy of that folder. See "Hosting" in docs/asset-format.md.
//
//   g/<game path>.<hash>.<ext>   a copy of each game file the viewer can load, named by its content
//   r/<release>/…                the viewer's data, its JSON naming game files by their g/ keys
//   release.json                 { "release": "<release>" }: the current release (the one file that changes)

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { writeIfChanged } from './extract.mjs'

export const POINTER = 'release.json'
export const IMMUTABLE = 'public, max-age=31536000, immutable'
/** The pointer is read on every page load: short, so a new release reaches visitors within a minute. */
export const POINTER_CACHE = 'public, max-age=60'
export const CONTENT_TYPES = {
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.exr': 'image/x-exr', '.json': 'application/json',
  '.glsl': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
}
export const contentType = (key) => {
  const t = CONTENT_TYPES[path.extname(key).toLowerCase()]
  if (!t) throw new Error(`no content type for ${key}`)
  return t
}

/**
 * Every name the viewer's JSON uses for a hosted game file → its g/ key: the file itself, and for a texture the names
 * the build writes (`.png`, `.vtex`), which the viewer used to turn into `.webp` itself.
 */
export function aliases(gameFiles) {
  const map = new Map()
  for (const { rel, key } of gameFiles) {
    const m = /^(.*)\.(webp|png)$/.exec(rel)
    if (m) for (const ext of m[2] === 'webp' ? ['png', 'vtex'] : ['vtex']) map.set(`${m[1]}.${ext}`, key)
    map.set(rel, key)
  }
  return map
}

const GAME_LIKE = /\.(png|vtex|glb|exr)$/

/**
 * A copy of a JSON value with every string (and object key) that names a hosted game file replaced by its g/ key.
 * `unresolved` collects game-like names that aren't hosted (the agents' third-person bodies, the map's own EXR).
 */
export function rewrite(value, map, unresolved) {
  const one = (s) => {
    const key = map.get(s)
    if (key) return key
    if (GAME_LIKE.test(s)) unresolved.add(s)
    return s
  }
  if (typeof value === 'string') return one(value)
  if (Array.isArray(value)) return value.map((v) => rewrite(v, map, unresolved))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [one(k), rewrite(v, map, unresolved)]))
  return value
}

/** Copies src to the staged dst unless it's there already (same size and date). */
export function stageCopy(src, dst) {
  if (existsSync(dst)) {
    const a = statSync(src), b = statSync(dst)
    if (a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < 2) return false
  }
  mkdirSync(path.dirname(dst), { recursive: true })
  copyFileSync(src, dst)
  return true
}

export const stageWrite = writeIfChanged

/** Removes staged files that aren't in `keep` (local staging only; nothing in the bucket), then empty folders. */
export function pruneStage(root, keep) {
  let removed = 0
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(full)
        if (readdirSync(full).length === 0) rmdirSync(full)
      } else if (!keep.has(path.relative(root, full).split(path.sep).join('/'))) { rmSync(full); removed++ }
    }
  }
  walk(root)
  return removed
}

/** Cache-Control for a key: immutable, except the pointer. */
export const cacheControlFor = (key) => (key === POINTER ? POINTER_CACHE : IMMUTABLE)

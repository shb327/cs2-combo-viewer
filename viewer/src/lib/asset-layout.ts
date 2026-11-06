import { ASSET_BASE } from '@/lib/config'

/**
 * Where the viewer data and the game files are, relative to ASSET_BASE (see "Hosting" in docs/asset-format.md).
 *
 * - Local (a relative base: the dev server and `vite preview` serving the pipeline's folder): `extracted/viewer/` and
 *   `extracted/game/`, the JSON naming game files by their game paths.
 * - Hosted (an absolute base: the bucket): `r/<release>/`, its JSON naming game files by their keys
 *   (`g/<game path>.<hash>.<ext>`, from the base), so game files have no folder of their own. The release is
 *   `VITE_ASSET_RELEASE` when the build sets it, else the bucket's `release.json`, read once at start-up (cached for a
 *   minute), so a new asset release reaches pages without a viewer deploy.
 *
 * `VITE_ASSET_RELEASE=local` keeps the local layout under an absolute base.
 */
export interface AssetLayout {
  /** The hosted release, null when local (or when the pointer couldn't be read). */
  release: string | null
  viewerData: string
  gameRoot: string
}

export const RELEASE_POINTER = 'release.json'
const LOCAL: AssetLayout = { release: null, viewerData: 'extracted/viewer/', gameRoot: 'extracted/game/' }

async function resolveLayout(): Promise<AssetLayout> {
  const pinned = (import.meta.env.VITE_ASSET_RELEASE as string | undefined)?.trim()
  if (pinned === 'local' || (!pinned && !/^https?:\/\//.test(ASSET_BASE))) return LOCAL
  let release = pinned
  if (!release) {
    try {
      const r = await fetch(ASSET_BASE + RELEASE_POINTER)
      if (r.ok) release = ((await r.json()) as { release?: string }).release
    } catch { /* offline or blocked: the catalog's load fails below and says so */ }
  }
  if (!release || !/^[0-9a-f]{12}$/.test(release)) {
    console.error(`No asset release at ${ASSET_BASE}${RELEASE_POINTER}`)
    return { release: null, viewerData: 'r/none/', gameRoot: '' }
  }
  return { release, viewerData: `r/${release}/`, gameRoot: '' }
}

/** Resolved before any module that loads assets runs (they import it). */
export const ASSET_LAYOUT: AssetLayout = await resolveLayout()
export const VIEWER_DATA = ASSET_LAYOUT.viewerData
export const GAME_ROOT = ASSET_LAYOUT.gameRoot

/** The name the viewer's JSON gives a game file, from the path it's loaded by (without the game root). */
export const dataPath = (p: string): string => (p.startsWith(GAME_ROOT) ? p.slice(GAME_ROOT.length) : p)

/** A game file's path as the game names it: without the game root, and for a hosted key without `g/` and the hash. */
export const gamePath = (p: string): string => dataPath(p).replace(/^g\//, '').replace(/\.[0-9a-f]{12}(\.\w+)$/, '$1')

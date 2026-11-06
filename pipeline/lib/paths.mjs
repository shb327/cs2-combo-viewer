// Where the pipeline may read and write. Every script resolves its paths through insideRoot, so nothing outside the
// copies (SOURCE) and the user's screenshots (REFERENCE) is ever read and nothing outside EXTRACTED is ever written.

import path from 'node:path'

export const SOURCE = path.resolve(process.env.CS2_SOURCE ?? 'C:/cs2-data/source')
export const EXTRACTED = path.resolve(process.env.CS2_EXTRACTED ?? 'C:/cs2-data/extracted')
/** The user's own screenshots of the game (map backgrounds, references): read only, never in git. */
export const REFERENCE = path.resolve(process.env.CS2_REFERENCE ?? 'C:/cs2-data/reference')
/** Combo Skin's catalog as fetched from GitHub (fetch-catalog.mjs): read only, never in git. */
export const CATALOG = path.resolve(process.env.CS2_CATALOG ?? 'C:/cs2-data/catalog')
/** The asset folder the viewer's dev server serves at /assets/. */
export const WEB = path.join(EXTRACTED, 'web')
/** The viewer's own data and the decoded game files, as the viewer addresses them (VIEWER_DATA, GAME_ROOT). */
export const VIEWER_DATA = path.join(WEB, 'extracted', 'viewer')
export const GAME_ROOT = path.join(WEB, 'extracted', 'game')

/** The full path of `p`, refusing anything outside `root`. */
export function insideRoot(root, p) {
  const full = path.resolve(p)
  const rel = path.relative(root, full)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`${full} is outside ${root}`)
  return full
}

/** "--key value" pairs. */
export function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error('unexpected argument ' + argv[i])
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) o[key] = true
    else { o[key] = next; i++ }
  }
  return o
}

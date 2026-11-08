// Builds the viewer for the worker, pinned to one asset release: `npm run build` in worker/.
// The release: WORKER_ASSET_RELEASE, else the bucket's current one (its release.json). Output: worker/viewer-dist/
// (not in git), with worker-build.json naming the release, the asset host and the commit.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const ASSET_BASE = 'https://assets.combo.skin'
const here = import.meta.dirname
const viewer = path.resolve(here, '..', 'viewer')
const out = path.join(here, 'viewer-dist')
const vite = path.join(viewer, 'node_modules', 'vite', 'bin', 'vite.js')

if (!existsSync(vite)) {
  console.error('The viewer\'s packages aren\'t installed: run "npm ci" in viewer/ first.')
  process.exit(1)
}

let release = process.env.WORKER_ASSET_RELEASE?.trim()
if (!release) {
  const res = await fetch(`${ASSET_BASE}/release.json`, { cache: 'no-store' })
  if (!res.ok) { console.error(`${ASSET_BASE}/release.json: ${res.status}`); process.exit(1) }
  release = (await res.json()).release
}
if (!/^[0-9a-f]{12}$/.test(release ?? '')) { console.error(`Not a release: ${JSON.stringify(release)}`); process.exit(1) }

const env = { ...process.env, VITE_ASSET_BASE: ASSET_BASE, VITE_ASSET_RELEASE: release }
console.log(`Building the viewer for release ${release} into ${out}`)
const r = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], { cwd: viewer, env, stdio: 'inherit' })
if (r.status !== 0) process.exit(r.status ?? 1)

let commit = null
try { commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim() } catch { /* not a checkout */ }
writeFileSync(path.join(out, 'worker-build.json'), JSON.stringify({ release, assetBase: ASSET_BASE, commit, builtAt: new Date().toISOString() }, null, 2) + '\n')
console.log(`Done: release ${release}, viewer commit ${commit}`)

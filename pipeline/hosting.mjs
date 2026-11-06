// The files hosting needs, with the content-hashed names they will have there, and the totals (see "Hosting" in
// docs/asset-format.md). Walks the viewer's JSON for every file a combo can load, so nothing is listed that no page
// asks for (PNGs that have a WebP, the agents' third-person bodies, old folders).
//
//   node hosting.mjs
//
// Writes work/hosting/manifest.json ({ release, files: [{ key, src, bytes, sha256, kind, shared }] }) and
// work/hosting/totals.json, and prints the totals. Reads and writes only under C:/cs2-data/extracted. Uploads nothing.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { writeIfChanged } from './lib/extract.mjs'
import { EXTRACTED, GAME_ROOT, VIEWER_DATA } from './lib/paths.mjs'

const OUT = path.join(EXTRACTED, 'work', 'hosting')
const readJson = (f) => JSON.parse(readFileSync(path.join(VIEWER_DATA, f), 'utf8'))
const listDir = (d) => (existsSync(path.join(VIEWER_DATA, d)) ? readdirSync(path.join(VIEWER_DATA, d)) : [])

/** Every game file a JSON value names (textures as .png or .vtex, models, EXRs), as the file hosting serves. */
function gameFiles(value, out = new Set()) {
  if (typeof value === 'string') {
    const m = /^(.*)\.(png|vtex|glb|exr)$/.exec(value)
    if (m) {
      const p = m[2] === 'png' || m[2] === 'vtex' ? `${m[1]}.webp` : value
      const fallback = `${m[1]}.png`
      if (existsSync(path.join(GAME_ROOT, p))) out.add(p)
      else if (m[2] !== 'glb' && m[2] !== 'exr' && existsSync(path.join(GAME_ROOT, fallback))) out.add(fallback)
    }
  } else if (Array.isArray(value)) for (const v of value) gameFiles(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) gameFiles(v, out)
  return out
}

/** file (relative to GAME_ROOT) → { kind, owners: Set } (the first kind that claims a file keeps it). */
const game = new Map()
const claim = (files, kind, owner) => {
  for (const f of files) {
    if (!game.has(f)) game.set(f, { kind, owners: new Set() })
    game.get(f).owners.add(owner)
  }
}
const index = readJson('index.json')
for (const [name, info] of Object.entries(index.items)) {
  const item = readJson(`items/${name}.json`)
  const type = info.type === 'Gloves' ? 'glove' : 'knife'
  claim([item.glb], `${type} models`, name)
  claim(gameFiles(item.meshes), `${type} textures`, name)
}
// Textures every weapon finish names (the grunge and the wear) are their own kind.
const kitFiles = new Map()
for (const s of index.skins) kitFiles.set(`${s.item}|${s.kit}`, gameFiles(readJson(`kits/${s.kit}.json`)))
const weaponKits = index.skins.filter((s) => index.items[s.item].type !== 'Gloves')
const everyWeaponKit = [...kitFiles.get(`${weaponKits[0].item}|${weaponKits[0].kit}`)].filter((f) => weaponKits.filter((s) => s.kit !== 'vanilla').every((s) => kitFiles.get(`${s.item}|${s.kit}`).has(f)))
claim(everyWeaponKit, 'weapon grunge and wear', 'every weapon finish')
for (const s of index.skins) claim(kitFiles.get(`${s.item}|${s.kit}`), index.items[s.item].type === 'Gloves' ? 'glove finishes' : 'knife finishes', `${s.item}|${s.kit}`)
const agents = readJson('agents.json')
for (const a of agents.agents) {
  const m = agents.models[a.model]
  const fp = Object.fromEntries(Object.entries(m.drawCalls).filter(([k]) => /^firstperson/.test(k)))
  claim([m.glb], 'agent arms', a.id)
  claim(gameFiles(fp), 'agent arms', a.id)
}
const maps = existsSync(path.join(VIEWER_DATA, 'maps.json')) ? readJson('maps.json') : []

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
const files = []
for (const [rel, { kind, owners }] of game) {
  const src = path.join(GAME_ROOT, rel)
  const hash = sha(src)
  const ext = path.extname(rel)
  files.push({ key: `g/${rel.slice(0, -ext.length)}.${hash.slice(0, 12)}${ext}`, src: `game/${rel}`, bytes: statSync(src).size, sha256: hash, kind, shared: owners.size })
}
// The viewer's data (JSON), the compositing shaders and the maps: one release folder each build.
const release = []
const walk = (dir, kind) => {
  for (const e of readdirSync(path.join(VIEWER_DATA, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory()) { walk(rel, rel.startsWith('shaders') ? 'shaders' : rel.startsWith('maps') || rel.startsWith('backgrounds') ? 'maps' : kind); continue }
    if (/\.(jpg|png)$/.test(e.name) && rel.startsWith('backgrounds/')) continue // the WebPs are what pages load
    const src = path.join(VIEWER_DATA, rel)
    release.push({ rel, src: `viewer/${rel}`, bytes: statSync(src).size, sha256: sha(src), kind: rel.startsWith('shaders/') ? 'shaders' : /^(maps|backgrounds)\//.test(rel) || /^(maps|scenes)\.json$/.test(rel) ? 'maps' : 'viewer data' })
  }
}
walk('', 'viewer data')
void maps
const releaseId = createHash('sha256').update(release.map((f) => `${f.rel}:${f.sha256}`).sort().join('\n')).update(files.map((f) => f.key).sort().join('\n')).digest('hex').slice(0, 12)
for (const f of release) files.push({ key: `r/${releaseId}/${f.rel}`, src: f.src, bytes: f.bytes, sha256: f.sha256, kind: f.kind, shared: 0 })

const totals = {}
for (const f of files) {
  const t = (totals[f.kind] ??= { files: 0, bytes: 0 })
  t.files++; t.bytes += f.bytes
}
const all = { files: files.length, bytes: files.reduce((s, f) => s + f.bytes, 0) }
const sharedGame = files.filter((f) => f.shared > 1)
writeIfChanged(path.join(OUT, 'manifest.json'), JSON.stringify({ release: releaseId, files }, null, 0))
writeIfChanged(path.join(OUT, 'totals.json'), JSON.stringify({ release: releaseId, totals, all, sharedGameFiles: { files: sharedGame.length, bytes: sharedGame.reduce((s, f) => s + f.bytes, 0) } }, null, 1))
const mb = (n) => (n / 1e6).toFixed(1) + ' MB'
console.log(`release ${releaseId}`)
for (const [k, t] of Object.entries(totals).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`  ${k.padEnd(24)} ${String(t.files).padStart(5)} files ${mb(t.bytes).padStart(10)}`)
console.log(`  ${'all'.padEnd(24)} ${String(all.files).padStart(5)} files ${mb(all.bytes).padStart(10)}`)
console.log(`  game files used by more than one item or finish: ${sharedGame.length} (${mb(sharedGame.reduce((s, f) => s + f.bytes, 0))}), each stored once`)

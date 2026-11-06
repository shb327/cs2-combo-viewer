// The files hosting needs, with the content-hashed names they will have there, and the totals (see "Hosting" in
// docs/asset-format.md). Walks the viewer's JSON for every file a combo can load, so nothing is listed that no page
// asks for (PNGs that have a WebP, the agents' third-person bodies, old folders). Then stages the bucket's layout in
// work/hosting/publish/ (lib/publish.mjs): the game files under their g/ keys, the release with its JSON rewritten to
// name them, and the pointer to the release.
//
//   node hosting.mjs
//
// Writes work/hosting/manifest.json ({ release, files: [{ key, src, bytes, sha256, md5, kind, shared, contentType,
// cacheControl }] }: exactly what the bucket should hold), work/hosting/totals.json and work/hosting/publish/, and
// prints the totals. Reads and writes only under C:/cs2-data/extracted. Uploads nothing (upload.mjs does).

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { writeIfChanged } from './lib/extract.mjs'
import { aliases, cacheControlFor, contentType, POINTER, pruneStage, rewrite, stageCopy, stageWrite } from './lib/publish.mjs'
import { EXTRACTED, GAME_ROOT, VIEWER_DATA } from './lib/paths.mjs'

const OUT = path.join(EXTRACTED, 'work', 'hosting')
const STAGE = path.join(OUT, 'publish')
const readJson = (f) => JSON.parse(readFileSync(path.join(VIEWER_DATA, f), 'utf8'))

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
const hashes = (buf) => ({ sha256: createHash('sha256').update(buf).digest('hex'), md5: createHash('md5').update(buf).digest('hex') })
const files = []
for (const [rel, { kind, owners }] of game) {
  const src = path.join(GAME_ROOT, rel)
  const { sha256, md5 } = hashes(readFileSync(src))
  const ext = path.extname(rel)
  files.push({ rel, key: `g/${rel.slice(0, -ext.length)}.${sha256.slice(0, 12)}${ext}`, src: `game/${rel}`, bytes: statSync(src).size, sha256, md5, kind, shared: owners.size })
}
// The viewer's data (JSON), the compositing shaders and the maps: one release folder each build, its JSON naming game
// files by their g/ keys. The release is a hash of what is published, so a rebuild with nothing changed (no game file
// renamed, no data changed) gives the same release and uploads nothing.
const names = aliases(files)
const unresolved = new Set()
const release = []
const walk = (dir) => {
  for (const e of readdirSync(path.join(VIEWER_DATA, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory()) { walk(rel); continue }
    if (/\.(jpg|png)$/.test(e.name) && rel.startsWith('backgrounds/')) continue // the WebPs are what pages load
    const src = path.join(VIEWER_DATA, rel)
    const body = rel.endsWith('.json') ? Buffer.from(JSON.stringify(rewrite(JSON.parse(readFileSync(src, 'utf8')), names, unresolved))) : null
    release.push({ rel, src: `viewer/${rel}`, body, bytes: body ? body.length : statSync(src).size, ...hashes(body ?? readFileSync(src)), kind: rel.startsWith('shaders/') ? 'shaders' : /^(maps|backgrounds)\//.test(rel) || /^(maps|scenes)\.json$/.test(rel) ? 'maps' : 'viewer data' })
  }
}
walk('')
const releaseId = createHash('sha256').update(release.map((f) => `${f.rel}:${f.sha256}`).sort().join('\n')).digest('hex').slice(0, 12)

// Stage the bucket: game files copied under their keys, the release written, the pointer last.
let staged = 0
for (const f of files) if (stageCopy(path.join(GAME_ROOT, f.rel), path.join(STAGE, f.key))) staged++
for (const f of release) {
  const key = `r/${releaseId}/${f.rel}`
  const dst = path.join(STAGE, key)
  if (f.body ? stageWrite(dst, f.body) : stageCopy(path.join(VIEWER_DATA, f.rel), dst)) staged++
  files.push({ key, src: f.src, bytes: f.bytes, sha256: f.sha256, md5: f.md5, kind: f.kind, shared: 0 })
}
const pointer = Buffer.from(JSON.stringify({ release: releaseId }))
if (stageWrite(path.join(STAGE, POINTER), pointer)) staged++
const pointerEntry = { key: POINTER, src: null, bytes: pointer.length, ...hashes(pointer), kind: 'pointer', shared: 0 }
for (const f of files) delete f.rel
const pruned = pruneStage(STAGE, new Set([...files.map((f) => f.key), POINTER]))

const totals = {}
for (const f of files) {
  const t = (totals[f.kind] ??= { files: 0, bytes: 0 })
  t.files++; t.bytes += f.bytes
}
const all = { files: files.length, bytes: files.reduce((s, f) => s + f.bytes, 0) }
const sharedGame = files.filter((f) => f.shared > 1)
const listed = [...files, pointerEntry].map((f) => ({ ...f, contentType: contentType(f.key), cacheControl: cacheControlFor(f.key) }))
writeIfChanged(path.join(OUT, 'manifest.json'), JSON.stringify({ release: releaseId, files: listed }, null, 0))
writeIfChanged(path.join(OUT, 'totals.json'), JSON.stringify({ release: releaseId, totals, all, sharedGameFiles: { files: sharedGame.length, bytes: sharedGame.reduce((s, f) => s + f.bytes, 0) } }, null, 1))
const mb = (n) => (n / 1e6).toFixed(1) + ' MB'
console.log(`release ${releaseId}`)
for (const [k, t] of Object.entries(totals).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`  ${k.padEnd(24)} ${String(t.files).padStart(5)} files ${mb(t.bytes).padStart(10)}`)
console.log(`  ${'all'.padEnd(24)} ${String(all.files).padStart(5)} files ${mb(all.bytes).padStart(10)}`)
console.log(`  game files used by more than one item or finish: ${sharedGame.length} (${mb(sharedGame.reduce((s, f) => s + f.bytes, 0))}), each stored once`)
console.log(`  plus ${POINTER} (the current release, ${pointer.length} bytes)`)
console.log(`staged in ${STAGE}: ${staged} files written, ${pruned} old ones removed`)
if (unresolved.size) console.log(`names in the JSON not hosted (kept as they are): ${unresolved.size}, for example ${[...unresolved].slice(0, 3).join(', ')}`)

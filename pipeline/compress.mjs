// Writes a WebP next to every PNG texture the build extracted, for the viewer to load instead (it tries <name>.webp
// first). Run after build.mjs:
//
//   node compress.mjs [--force]
//
// - Albedos (the draw calls' `color` and the knives' composite colour) are lossy; every other texture (normals, masks,
//   AO, packed channels, the compositors' inputs) is near-lossless. See lib/webp.mjs.
// - Textures larger than 2048 are halved until they fit: both compositors render at 2048 and nothing in first person
//   samples a texture finer than that.
// - Incremental: work/compress/manifest.json keeps each PNG's size, date and SHA-1 with the mode its WebP was made in.
//   A PNG whose size and date are unchanged is not read; one with a new date but the same content (extracted again,
//   unchanged) is not re-encoded. New settings (MODES, MAX_SIZE) or --force redo all. Nothing is written when nothing
//   changed.
// Reads and writes only under C:\cs2-data\extracted.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { halve, readPng, writePng } from './lib/image.mjs'
import { writeIfChanged } from './lib/extract.mjs'
import { EXTRACTED, GAME_ROOT, VIEWER_DATA, insideRoot, parseArgs } from './lib/paths.mjs'
import { MODES, cwebp } from './lib/webp.mjs'

const args = parseArgs(process.argv.slice(2))
const MAX_SIZE = 2048
const WORK = path.join(EXTRACTED, 'work', 'compress')
mkdirSync(WORK, { recursive: true })
const stampFile = path.join(WORK, 'settings.json')
const settings = JSON.stringify({ MODES, MAX_SIZE })
const force = !!args.force || !existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== settings
const manifestFile = path.join(WORK, 'manifest.json')
const manifest = !force && existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {}
let manifestDirty = false
const encoded = []

/** The albedos, from the viewer's JSON: items and agents' draw calls. */
const colour = new Set()
const addCalls = (meshes) => {
  for (const calls of Object.values(meshes ?? {})) for (const c of calls) {
    if (c.color) colour.add(c.color)
    if (c.composite?.color) colour.add(c.composite.color)
  }
}
for (const f of readdirSync(path.join(VIEWER_DATA, 'items'))) addCalls(JSON.parse(readFileSync(path.join(VIEWER_DATA, 'items', f), 'utf8')).meshes)
for (const m of Object.values(JSON.parse(readFileSync(path.join(VIEWER_DATA, 'agents.json'), 'utf8')).models)) addCalls(m.drawCalls)

const pngs = []
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.toLowerCase().endsWith('.png')) pngs.push(p)
  }
}
walk(GAME_ROOT)

let done = 0, kept = 0, pngBytes = 0, webpBytes = 0
const failed = []
async function one(png) {
  const rel = path.relative(GAME_ROOT, png).replace(/\\/g, '/')
  const out = insideRoot(EXTRACTED, png.replace(/\.png$/i, '.webp'))
  const mode = colour.has(rel) ? 'colour' : 'data'
  const st = statSync(png)
  pngBytes += st.size
  const prev = manifest[rel]
  const same = prev && prev.mode === mode && existsSync(out)
  if (same && prev.size === st.size && prev.mtimeMs === st.mtimeMs) { kept++; webpBytes += statSync(out).size; return }
  try {
    const buf = readFileSync(png)
    const sha1 = createHash('sha1').update(buf).digest('hex')
    if (same && prev.sha1 === sha1) {
      manifest[rel] = { ...prev, size: st.size, mtimeMs: st.mtimeMs }
      manifestDirty = true
      kept++; webpBytes += statSync(out).size
      return
    }
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
    if (Math.max(w, h) > MAX_SIZE) {
      let img = readPng(buf)
      while (Math.max(img.w, img.h) > MAX_SIZE) img = halve(img)
      const tmp = path.join(WORK, `${path.basename(png, '.png')}-${process.pid}.png`)
      writePng(tmp, img)
      await cwebp(tmp, out, mode)
      rmSync(tmp)
    } else {
      await cwebp(png, out, mode)
    }
    webpBytes += statSync(out).size
    manifest[rel] = { size: st.size, mtimeMs: st.mtimeMs, sha1, mode, webp: statSync(out).size }
    manifestDirty = true
    encoded.push(rel)
    done++
  } catch (e) {
    failed.push(`${rel}: ${e.message}`)
  }
}

const queue = [...pngs]
await Promise.all(Array.from({ length: Math.max(1, os.availableParallelism() - 1) }, async () => {
  while (queue.length) await one(queue.shift())
}))
writeIfChanged(stampFile, settings)
if (manifestDirty) writeFileSync(manifestFile, JSON.stringify(manifest))
// The textures the last run that encoded any re-encoded (part B uploads what changed).
if (encoded.length) writeIfChanged(path.join(WORK, 'encoded.json'), JSON.stringify(encoded.sort(), null, 1))
const mb = (n) => (n / 1e6).toFixed(1) + ' MB'
console.log(`${pngs.length} textures: ${done} encoded, ${kept} kept; PNG ${mb(pngBytes)} → WebP ${mb(webpBytes)}`)
if (failed.length) { console.log(`${failed.length} failed:\n  ${failed.join('\n  ')}`); process.exitCode = 1 }

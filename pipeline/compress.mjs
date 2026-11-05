// Writes a WebP next to every PNG texture the build extracted, for the viewer to load instead (it tries <name>.webp
// first). Run after build.mjs:
//
//   node compress.mjs [--force]
//
// - Albedos (the draw calls' `color` and the knives' composite colour) are lossy; every other texture (normals, masks,
//   AO, packed channels, the compositors' inputs) is near-lossless. See lib/webp.mjs.
// - Textures larger than 2048 are halved until they fit: both compositors render at 2048 and nothing in first person
//   samples a texture finer than that.
// - A WebP newer than its PNG and made with the same settings is kept (--force redoes all).
// Reads and writes only under C:\cs2-data\extracted.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { halve, readPng, writePng } from './lib/image.mjs'
import { EXTRACTED, GAME_ROOT, VIEWER_DATA, insideRoot, parseArgs } from './lib/paths.mjs'
import { MODES, cwebp } from './lib/webp.mjs'

const args = parseArgs(process.argv.slice(2))
const MAX_SIZE = 2048
const WORK = path.join(EXTRACTED, 'work', 'compress')
mkdirSync(WORK, { recursive: true })
const stampFile = path.join(WORK, 'settings.json')
const settings = JSON.stringify({ MODES, MAX_SIZE })
const force = !!args.force || !existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== settings

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
  pngBytes += statSync(png).size
  if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(png).mtimeMs) { kept++; webpBytes += statSync(out).size; return }
  try {
    const buf = readFileSync(png)
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
    done++
  } catch (e) {
    failed.push(`${rel}: ${e.message}`)
  }
}

const queue = [...pngs]
await Promise.all(Array.from({ length: Math.max(1, os.availableParallelism() - 1) }, async () => {
  while (queue.length) await one(queue.shift())
}))
writeFileSync(stampFile, settings)
const mb = (n) => (n / 1e6).toFixed(1) + ' MB'
console.log(`${pngs.length} textures: ${done} encoded, ${kept} kept; PNG ${mb(pngBytes)} → WebP ${mb(webpBytes)}`)
if (failed.length) { console.log(`${failed.length} failed:\n  ${failed.join('\n  ')}`); process.exitCode = 1 }

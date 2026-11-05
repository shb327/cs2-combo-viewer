// Fetches Combo Skin's catalog (the files items.json's "catalog" pins: ByMykel/CSGO-API at one commit) from GitHub into
// C:/cs2-data/catalog/<commit>/, once. Reads nothing else and writes only there.
//
//   node fetch-catalog.mjs [--items items.json] [--force]

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogDir } from './lib/catalog.mjs'
import { parseArgs } from './lib/paths.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
const pin = JSON.parse(readFileSync(args.items ?? path.join(here, 'items.json'), 'utf8')).catalog
if (!/^[0-9a-f]{40}$/.test(pin?.commit ?? '')) throw new Error('items.json: catalog.commit must be a full commit hash')
const dir = catalogDir(pin)
mkdirSync(dir, { recursive: true })
for (const file of pin.files) {
  const out = path.join(dir, path.basename(file))
  if (existsSync(out) && !args.force) { console.log(`${out}: kept`); continue }
  const url = `https://raw.githubusercontent.com/${pin.repo}/${pin.commit}/${file}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  JSON.parse(buf.toString('utf8'))
  writeFileSync(out, buf)
  console.log(`${out}: ${buf.length} bytes, sha256 ${createHash('sha256').update(buf).digest('hex')}`)
}

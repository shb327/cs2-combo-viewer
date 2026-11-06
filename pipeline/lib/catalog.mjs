// What to build: Combo Skin's catalog, so the viewer and the site always agree. The catalog is ByMykel/CSGO-API's
// public/api/en/skins.json and agents.json at the commit items.json pins, fetched once by fetch-catalog.mjs into
// C:/cs2-data/catalog/<commit>/ (read only; never in git). Knives and gloves are keyed by item definition index and
// paint index (Doppler and Gamma Doppler phases have their own paint index), agents by item definition index; each key
// is resolved against items_game, and what doesn't resolve is reported, not guessed.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CATALOG, insideRoot } from './paths.mjs'

/** The pinned catalog's folder. */
export const catalogDir = (pin) => insideRoot(CATALOG, path.join(CATALOG, pin.commit.slice(0, 7)))

export function readCatalog(pin) {
  const dir = catalogDir(pin)
  const read = (name) => {
    const f = path.join(dir, name)
    if (!existsSync(f)) throw new Error(`${f} is missing: run node pipeline/fetch-catalog.mjs`)
    return JSON.parse(readFileSync(f, 'utf8'))
  }
  return { skins: read('skins.json'), agents: read('agents.json') }
}

/** The finish a vanilla knife is built as: no paint kit, the model's own materials. */
export const VANILLA = 'vanilla'

/**
 * The build list from the catalog and items_game: { knives, gloves: { [item]: kitName[] }, agents: itemName[], problems }.
 * `problems` lists every catalog entry the game files don't resolve (unknown item, unknown paint index).
 */
export function buildList(catalog, IG) {
  const itemsByIndex = new Map(Object.entries(IG.items).map(([i, d]) => [Number(i), d]))
  const kitsByIndex = new Map(Object.entries(IG.paint_kits).map(([i, k]) => [Number(i), k]))
  const out = { knives: {}, gloves: {}, agents: [], problems: [], entries: [] }
  for (const s of catalog.skins) {
    const category = s.category?.name
    if (category !== 'Knives' && category !== 'Gloves') continue
    const defindex = Number(s.weapon?.weapon_id)
    const item = itemsByIndex.get(defindex)
    const entry = { category, defindex, paintIndex: s.paint_index == null ? null : Number(s.paint_index), name: s.name, phase: s.phase ?? null }
    out.entries.push(entry)
    if (!item) { out.problems.push({ ...entry, problem: `item definition ${defindex} not in items_game` }); continue }
    entry.item = item.name
    const list = (category === 'Knives' ? out.knives : out.gloves)[item.name] ??= []
    if (entry.paintIndex == null) {
      if (category !== 'Knives') { out.problems.push({ ...entry, problem: 'gloves without a paint index' }); continue }
      entry.kit = VANILLA
      list.push(VANILLA)
      continue
    }
    const kit = kitsByIndex.get(entry.paintIndex)
    if (!kit) { out.problems.push({ ...entry, problem: `paint index ${entry.paintIndex} not in items_game` }); continue }
    entry.kit = kit.name
    if (!list.includes(kit.name)) list.push(kit.name)
  }
  for (const a of catalog.agents) {
    const defindex = Number(a.def_index)
    const item = itemsByIndex.get(defindex)
    const entry = { category: 'Agents', defindex, name: a.name }
    out.entries.push(entry)
    if (!item) { out.problems.push({ ...entry, problem: `item definition ${defindex} not in items_game` }); continue }
    entry.item = item.name
    out.agents.push(item.name)
  }
  return out
}

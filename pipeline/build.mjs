// Builds the viewer's data for every knife, glove and agent in Combo Skin's catalog (pinned in items.json, see
// lib/catalog.mjs) from the copied game files.
//
//   node build.mjs [--items items.json] [--only <item>[,<item>…]]
//
// Incremental: extraction is cached by each source file's CRC32 (lib/extract.mjs) and every output is written only
// when its bytes change, so a run with nothing changed decodes nothing and touches no file. work/changes.json lists
// what this run found changed in the copies and what it redid; work/build-report.json what was built and what failed.
//
// Reads only the copies (C:/cs2-data/source, through the C# tool) and writes only under C:/cs2-data/extracted:
//   work/                  intermediate files (model and material dumps, items_game, localization)
//   web/extracted/game/    models (.glb) and textures (.png, .exr) at their game paths
//   web/extracted/viewer/  the viewer's JSON: index, items, kits, agents, first person
// Run convert-shaders.mjs (after shader-dump) for the compositing shaders.

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { changes, extract, pakIndex, writeIfChanged } from './lib/extract.mjs'
import { VANILLA, buildList, readCatalog } from './lib/catalog.mjs'
import { parseKv1, parseLocalization } from './lib/kv1.mjs'
import { filterGlb } from './lib/glb.mjs'
import { boneHash, parseKv3 } from './lib/kv3.mjs'
import { EXTRACTED, GAME_ROOT, VIEWER_DATA, insideRoot, parseArgs } from './lib/paths.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
const config = JSON.parse(readFileSync(args.items ?? path.join(here, 'items.json'), 'utf8'))
const WORK = path.join(EXTRACTED, 'work')
const started = Date.now()

const strip = (p) => p.replace(/_c$/, '')
const workFile = (gamePath, ext) => path.join(WORK, 'files', strip(gamePath) + ext)
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const rewritten = []
const writeJson = (rel, data) => {
  const f = insideRoot(EXTRACTED, path.join(VIEWER_DATA, rel))
  if (writeIfChanged(f, JSON.stringify(data))) rewritten.push(rel)
  return f
}
/** What failed, by item and finish: the build goes on without them and lists them in work/build-report.json. */
const failures = []
const fail = (item, kit, stage, error) => {
  failures.push({ item, kit, stage, error: String(error?.message ?? error) })
  console.warn(`  ${item}${kit ? ' | ' + kit : ''} (${stage}): ${error?.message ?? error}`)
}

// ── The game's file list, items_game and the localization ──────────────────────────────────────────────────────────
const { files: FILES, changed: sourceChanges } = pakIndex()
/** The compiled vcompmats by file name (a kit's is found by its name). */
const compmats = new Map()
for (const f of FILES) {
  if (!f.endsWith('.vcompmat_c')) continue
  const base = path.posix.basename(f)
  if (!compmats.has(base)) compmats.set(base, [])
  compmats.get(base).push(strip(f))
}

extract([
  { kind: 'raw', path: 'scripts/items/items_game.txt', out: path.join(WORK, 'items_game.txt') },
  { kind: 'raw', path: 'resource/csgo_english.txt', out: path.join(WORK, 'csgo_english.txt') },
], path.join(WORK, 'jobs-0'))
const IG = parseKv1(readFileSync(path.join(WORK, 'items_game.txt'), 'utf8')).items_game
const LOC = parseLocalization(readFileSync(path.join(WORK, 'csgo_english.txt')))
const tr = (token) => (token ? LOC[token.replace(/^#/, '').toLowerCase()] ?? token : '')

const itemDef = (name) => {
  const [index, def] = Object.entries(IG.items).find(([, d]) => d.name === name) ?? []
  if (!def) throw new Error('item not in items_game: ' + name)
  // The prefab chain's values under the item's own.
  const chain = []
  for (let p = def.prefab; p; p = IG.prefabs[p]?.prefab) chain.unshift(IG.prefabs[p] ?? {})
  return { index: Number(index), ...Object.assign({}, ...chain), ...def }
}
const paintKit = (name) => {
  const [index, kit] = Object.entries(IG.paint_kits).find(([, k]) => k.name === name) ?? []
  if (!kit) throw new Error('paint kit not in items_game: ' + name)
  return { index: Number(index), ...kit, rarity: IG.paint_kits_rarity?.[name] ?? null }
}
/**
 * The finish's English name. Doppler and Gamma Doppler kits share one name in the game's text; their phase (the
 * market's "Doppler (Ruby)", "Gamma Doppler (Phase 2)") is in the kit's own name only.
 */
const PHASES = { ruby: 'Ruby', sapphire: 'Sapphire', blackpearl: 'Black Pearl', emerald: 'Emerald' }
const kitDisplayName = (kit) => {
  const name = tr(kit.description_tag)
  const phase = /_phase(\d)/.exec(kit.name)?.[1]
  const gem = /^am_(ruby|sapphire|blackpearl|emerald)_marbleized/.exec(kit.name)?.[1]
  return phase ? `${name} (Phase ${phase})` : gem ? `${name} (${PHASES[gem]})` : name
}

// ── What to build: the catalog ─────────────────────────────────────────────────────────────────────────────────────
const list = buildList(readCatalog(config.catalog), IG)
const only = args.only ? new Set(String(args.only).split(',')) : null
const wantItem = (name) => !only || only.has(name)
const kitsFor = (item, names) => names.flatMap((n) => {
  if (n === VANILLA) return [{ name: VANILLA, index: 0, rarity: null, vanilla: true }]
  try { return [paintKit(n)] } catch (e) { fail(item, n, 'items_game', e); return [] }
})
let knives = Object.entries(list.knives).filter(([n]) => wantItem(n)).map(([name, kits]) => ({ def: itemDef(name), kits: kitsFor(name, kits) }))
let gloves = Object.entries(list.gloves).filter(([n]) => wantItem(n)).map(([name, kits]) => ({ def: itemDef(name), kits: kitsFor(name, kits) }))
let agents = list.agents.filter((n) => !only || only.has(n) || only.has('agents')).map(itemDef)
const kitCompmat = (kit, folder) => {
  const found = (compmats.get(`${kit.name}.vcompmat_c`) ?? []).filter((f) => f.startsWith(folder))
  if (found.length !== 1) throw new Error(`${found.length} vcompmat files named ${kit.name} under ${folder}`)
  return found[0]
}
/** Keeps the kits `fn` doesn't throw on (the others are recorded as failures). */
const keepKits = (groups, stage, fn) => {
  for (const g of groups) g.kits = g.kits.filter((kit) => {
    try { fn(kit, g); return true } catch (e) { fail(g.def.name, kit.name, stage, e); return false }
  })
}
keepKits(knives, 'vcompmat', (kit) => { if (!kit.vanilla) kit.compmat = kitCompmat(kit, 'weapons/paints/') })
keepKits(gloves, 'vcompmat', (kit) => { kit.compmat = kitCompmat(kit, 'gloves/paints/') })

/**
 * The attack clips a knife's swings play: the ones the game's knife viewmodel graphs use
 * (animation/graphs/viewmodel/viewmodel_knife*.vnmgraph: every variation's LightMiss selector picks light_miss1 or
 * light_miss2 by attack_variation, HeavyMiss plays heavy_miss1). The misses, since the viewer has nothing to hit.
 */
const ATTACK_CLIPS = ['light_miss1', 'light_miss2', 'heavy_miss1']

/**
 * Each knife's first-person clips. Its viewmodel animations sit in a folder named as its model's
 * (weapons/models/knife/knife_m9/… → animation/anims/viewmodel/knife/knife_m9/): the first idle (idle1_<x>, else
 * idle_<x>), the first inspect (lookat01_<x>) and the swings (ATTACK_CLIPS).
 */
const firstPerson = {}
for (const { def } of knives) {
  const folder = path.posix.basename(path.posix.dirname(def.model_player))
  const suffix = folder.replace(/^knife_/, '')
  const dir = `animation/anims/viewmodel/knife/${folder}/`
  const has = (clip) => FILES.has(`${dir}${clip}.vnmclip_c`)
  const idle = [`idle1_${suffix}`, `idle_${suffix}`].find(has)
  const inspect = [`lookat01_${suffix}`].find(has)
  if (!idle) { fail(def.name, null, 'clips', `no idle clip in ${dir}`); continue }
  const attacks = ATTACK_CLIPS.filter((a) => has(`${a}_${suffix}`)).map((name) => ({ name, clip: `${name}_${suffix}` }))
  for (const a of ATTACK_CLIPS) if (!attacks.some((x) => x.name === a)) fail(def.name, null, 'clips', `no ${a} clip in ${dir}`)
  firstPerson[def.name] = { dir, idle, inspect, attacks }
}
const clipPath = (item, clip) => `${firstPerson[item].dir}${clip}.vnmclip`
const clips = Object.entries(firstPerson).flatMap(([item, c]) => [c.idle, c.inspect, ...c.attacks.map((a) => a.clip)].filter(Boolean).map((x) => clipPath(item, x)))
const kvFiles = new Map()
/** Loads KV3 files; returns the ones that failed, with their errors. */
const loadKv = (paths, round) => {
  const todo = [...new Set(paths)].filter((p) => !kvFiles.has(p))
  const r = extract(todo.map((p) => ({ kind: 'kv', path: p, out: workFile(p, '.json') })), path.join(WORK, round))
  const failed = new Map()
  for (const p of todo) {
    const e = r.get(p)
    if (!e || e.error) { failed.set(p, e?.error ?? 'not extracted'); continue }
    kvFiles.set(p, readJson(e.out))
  }
  return failed
}
const models = [...new Set([...knives.map((k) => k.def.model_player), ...gloves.map((g) => g.def.model_player), ...agents.map((a) => a.model_player)])]
{
  const bad = new Map()
  const r = extract([
    ...models.map((m) => ({ kind: 'model', path: m, out: path.join(GAME_ROOT, m.replace(/\.vmdl$/, '.json')) })),
    ...clips.map((c) => ({ kind: 'clip', path: c, out: workFile(c, '.json') })),
  ], path.join(WORK, 'jobs-1'))
  for (const [p, e] of r) if (e.error) bad.set(p, e.error)
  for (const [item, c] of Object.entries(firstPerson)) {
    const clip = [c.idle, c.inspect].filter(Boolean).map((x) => clipPath(item, x)).find((p) => bad.has(p))
    if (clip) { fail(item, null, 'clips', `${clip}: ${bad.get(clip)}`); delete firstPerson[item]; continue }
    // A swing that can't be decoded is left out; the knife keeps the others.
    c.attacks = c.attacks.filter((a) => {
      const p = clipPath(item, a.clip)
      if (bad.has(p)) fail(item, null, 'clips', `${p}: ${bad.get(p)}`)
      return !bad.has(p)
    })
  }
  const okModel = (name, m) => { if (!bad.has(m)) return true; fail(name, null, 'model', bad.get(m)); return false }
  knives = knives.filter((k) => okModel(k.def.name, k.def.model_player) && (firstPerson[k.def.name] || false))
  gloves = gloves.filter((g) => okModel(g.def.name, g.def.model_player))
  agents = agents.filter((a) => okModel(a.name, a.model_player))
}
const modelInfo = (m) => readJson(path.join(GAME_ROOT, m.replace(/\.vmdl$/, '.json')))
const allKits = () => [...knives, ...gloves].flatMap((x) => x.kits.filter((k) => !k.vanilla))

// ── Round 2: kit includes (recursive), paint materials, model materials ────────────────────────────────────────────
{
  const failed = loadKv(allKits().map((k) => k.compmat), 'jobs-2')
  keepKits([...knives, ...gloves], 'vcompmat', (kit) => { if (!kit.vanilla && failed.has(kit.compmat)) throw new Error(`${kit.compmat}: ${failed.get(kit.compmat)}`) })
}
for (let depth = 0; depth < 4; depth++) {
  const includes = [...kvFiles.values()].flatMap((doc) => procedures(doc).flatMap((p) => p.m_vecCompMatIncludes ?? [])).map(strip).filter((p) => !kvFiles.has(p))
  if (!includes.length) break
  for (const [p, e] of loadKv(includes, `jobs-2-${depth}`)) console.warn(`  include ${p}: ${e}`)
}
/** A vcompmat's assembly procedures, its includes' first. */
function procedures(doc) {
  return (doc.m_Points ?? []).flatMap((pt) => pt.m_vecCompositeMaterialAssemblyProcedures ?? [])
}
function allProcedures(compmat) {
  const doc = kvFiles.get(compmat)
  if (!doc) throw new Error(`${compmat} could not be read`)
  return procedures(doc).flatMap((p) => [...(p.m_vecCompMatIncludes ?? []).map(strip).flatMap(allProcedures), p])
}

const materials = new Map()
const loadMaterials = (paths, round) => {
  const todo = [...new Set(paths.map(strip))].filter((p) => !materials.has(p))
  const r = extract(todo.map((p) => ({ kind: 'material', path: p, out: workFile(p, '.json') })), path.join(WORK, round))
  for (const p of todo) {
    const e = r.get(p)
    if (e?.error) { console.warn(`  material ${p}: ${e.error}`); continue }
    materials.set(p, readJson(e.out))
  }
}
keepKits([...knives, ...gloves], 'vcompmat', (kit) => {
  if (kit.vanilla) return
  kit.procedures = allProcedures(kit.compmat)
  kit.containers = containers(kit.procedures)
  // Classic kits name their paint as a specific material; the newer gloves as a loose resource-material variable.
  const paintVar = (kit.containers.paint?.m_vecLooseVariables ?? []).find((v) => v.m_nVariableType === 'LOOSE_VARIABLE_TYPE_RESOURCE_MATERIAL')
  kit.paint = strip(kit.containers.paint?.m_strSpecificContainerMaterial ?? paintVar?.m_strResourceMaterial ?? '')
  if (!kit.paint) throw new Error(`${kit.name}: no paint material in its vcompmat`)
  // The newer gloves' passes start from the compositor template (workshop/paintkits/templates/glove_compositor.vmat).
  const compositor = kit.containers.paint_compositor?.m_strSpecificContainerMaterial
  kit.compositor = compositor ? strip(compositor) : null
})
/**
 * The materials to extract: every mesh of the knives and gloves; of the agents only the first-person groups (their arms),
 * unless items.json sets agentBodies (the third-person agent view needs the body's textures too).
 */
const agentModels = new Set(agents.map((a) => a.model_player))
const usedMeshes = (m) => modelInfo(m).meshes.filter((me) => config.agentBodies || !agentModels.has(m) || /^firstperson/.test(me.name))
const modelMaterials = models.flatMap((m) => usedMeshes(m).flatMap((me) => me.drawCalls.map((c) => c.material)))
loadMaterials([...allKits().flatMap((k) => [k.paint, k.compositor].filter(Boolean)), ...modelMaterials], 'jobs-3')
keepKits([...knives, ...gloves], 'material', (kit) => {
  if (!kit.vanilla && !materials.has(kit.paint)) throw new Error(`paint material ${kit.paint} could not be read`)
})

// ── Round 3: the knives' composite inputs ──────────────────────────────────────────────────────────────────────────
const compositeInputs = (mat) => (mat?.attributes?.composite_inputs ? strip(mat.attributes.composite_inputs) : null)
loadMaterials(modelMaterials.map((m) => compositeInputs(materials.get(strip(m)))).filter(Boolean), 'jobs-4')

// ── Round 4: textures ──────────────────────────────────────────────────────────────────────────────────────────────
const textureFiles = new Map()
const missingTextures = new Set()
/** Each texture's average colour (its vtex Reflectivity), by file under GAME_ROOT: the newer gloves' TextureAverageColor. */
const textureAverages = {}
{
  const wanted = new Set()
  for (const m of materials.values()) for (const t of Object.values(m.textures)) wanted.add(strip(t))
  const r = extract([...wanted].filter((t) => FILES.has(t + '_c')).map((t) => ({ kind: 'texture', path: t, out: path.join(GAME_ROOT, t.replace(/\.vtex$/, '.png')) })), path.join(WORK, 'jobs-5'))
  for (const [p, e] of r) {
    if (e.error) { console.warn(`  texture ${p}: ${e.error}`); continue }
    textureFiles.set(p, path.relative(GAME_ROOT, e.out).replace(/\\/g, '/'))
    if (e.reflectivity) textureAverages[textureFiles.get(p)] = e.reflectivity.map((x) => Math.round(x * 1e5) / 1e5)
  }
  const missing = [...wanted].filter((t) => !textureFiles.has(t))
  for (const t of missing) missingTextures.add(t)
  if (missing.length) console.log(`  ${missing.length} textures not in pak01 (left out; the viewer uses neutral defaults): ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''}`)
}
/** A material texture → its file under GAME_ROOT (.png or .exr), or null when it couldn't be extracted. */
const tex = (vtex) => (vtex ? textureFiles.get(strip(vtex)) ?? null : null)

// ── The vcompmat's containers, rolls and passes ────────────────────────────────────────────────────────────────────
/** The input containers by alias; a kit's own loose variables override the included ones of the same alias. */
function containers(procs) {
  const out = {}
  for (const p of procs) {
    for (const c of p.m_vecCompositeInputContainers ?? []) {
      const prev = out[c.m_strAlias]
      if (prev && c.m_vecLooseVariables) {
        const vars = new Map((prev.m_vecLooseVariables ?? []).map((v) => [v.m_strName, v]))
        for (const v of c.m_vecLooseVariables) vars.set(v.m_strName, v)
        out[c.m_strAlias] = { ...prev, ...c, m_vecLooseVariables: [...vars.values()] }
      } else out[c.m_strAlias] = c
    }
  }
  return out
}
const looseValue = (v) => {
  const t = v.m_nVariableType
  if (/FLOAT(\d)/.test(t)) return ['X', 'Y', 'Z', 'W'].slice(0, Number(/FLOAT(\d)/.exec(t)[1])).map((c) => v[`m_flValueFloat${c}`] ?? 0)
  if (/INTEGER/.test(t)) return v.m_nValueIntX ?? 0
  if (/BOOLEAN/.test(t)) return v.m_bValueBoolean ? 1 : 0
  return null
}
const looseParams = (c) => Object.fromEntries((c?.m_vecLooseVariables ?? []).map((v) => {
  const x = looseValue(v)
  return [v.m_strName, Array.isArray(x) && x.length === 1 ? x[0] : x]
}).filter(([, x]) => x !== null))
const looseBounds = (v) => {
  if (!v?.m_bHasFloatBounds) return null
  const n = Number(/FLOAT(\d)/.exec(v.m_nVariableType)?.[1] ?? 1)
  const cs = ['X', 'Y', 'Z', 'W'].slice(0, n)
  return { min: cs.map((c) => v[`m_flValueFloat${c}_Min`] ?? 0), max: cs.map((c) => v[`m_flValueFloat${c}_Max`] ?? 1) }
}
function walkMutators(list, fn) {
  for (const m of list ?? []) {
    fn(m)
    walkMutators(m.m_vecConditionalMutators, fn)
  }
}
/** The seed's rolls in order (every RANDOM_ROLL mutator), with the bounds their containers give. */
function kitRolls(kit) {
  const rolls = []
  const groups = []
  for (const p of kit.procedures) walkMutators(p.m_vecPropertyMutators, (m) => {
    if (m.m_nMutatorCommandType !== 'COMP_MAT_PROPERTY_MUTATOR_RANDOM_ROLL_INPUT_VARIABLES') return
    const vars = []
    for (const spec of m.m_vecRandomRollInputVars_InputVarsToRoll ?? []) {
      const [alias, name, comps = 'x'] = spec.split('.')
      const v = (kit.containers[alias]?.m_vecLooseVariables ?? []).find((x) => x.m_strName === name)
      const b = looseBounds(v)
      const n = comps.length
      rolls.push(b ? { var: name, min: b.min.slice(0, n), max: b.max.slice(0, n) } : { var: name, fixed: true })
      vars.push(`${name}.${comps}`)
    }
    // Its conditions (VALUE_EQUALS on the kit's flags or the hand's seed_offset), negated when m_bPassWhenTrue is false.
    const when = (m.m_vecConditions ?? []).filter((c) => c.m_nMutatorCondition.endsWith('VALUE_EQUALS')).map((c) => ({
      container: c.m_strMutatorConditionContainerName, var: c.m_strMutatorConditionContainerVarName,
      value: c.m_strMutatorConditionContainerVarValue, not: c.m_bPassWhenTrue === false,
    }))
    groups.push({ seed: (m.m_strRandomRollInputVars_SeedInputVar ?? '').split('.').pop() || 'g_nRandomSeed', vars, when })
  })
  return { rolls, groups }
}

/** A material's values as KitData params: features and ints, floats, vectors (vectors cut to their used size). */
function materialParams(mat) {
  const params = { ...mat.ints, ...mat.floats }
  for (const [k, v] of Object.entries(mat.vectors)) params[k] = /^g_vColor\d$/.test(k) ? v.slice(0, 3) : v
  return params
}
const materialTextures = (mat, keepVtex = false) => Object.fromEntries(Object.entries(mat.textures).map(([k, v]) => {
  if (keepVtex) return [k, tex(v) ? strip(v) : null]
  return [k, tex(v)]
}).filter(([, v]) => v))

/**
 * The vcompmat's mutators as the viewer's layers. A GENERATE_TEXTURE pass starts from its initial container; copies
 * from "paint" and the loose variables are resolved here, copies from the target material and the item's composite
 * inputs stay as references (they depend on the item). Conditions on containers this kit doesn't have are false.
 */
function kitPasses(kit, paintMat) {
  const paint = { params: materialParams(paintMat), textures: materialTextures(paintMat) }
  const source = (alias) => {
    if (alias === 'paint') return { literal: paint }
    if (alias === 'target' || alias === 'composite_inputs') return { ref: alias }
    const c = kit.containers[alias]
    const specific = c?.m_strSpecificContainerMaterial && materials.get(strip(c.m_strSpecificContainerMaterial))
    if (specific) return { literal: { params: materialParams(specific), textures: materialTextures(specific) } }
    if (c?.m_vecLooseVariables) return { literal: { params: looseParams(c), textures: {} } }
    return null
  }
  const conditionsHold = (m) => (m.m_vecConditions ?? []).every((c) => {
    const alias = c.m_strMutatorConditionContainerName
    // Conditions on the item's own containers are left to the runtime layers they guard (always copied there).
    // Those on the hand (handedness, material_seed) are left to the viewer, which sets what they guard per hand.
    if (alias === 'composite_inputs' || alias === 'target') return false
    const src = source(alias)
    if (!src?.literal) return false
    const has = c.m_strMutatorConditionContainerVarName in src.literal.params || c.m_strMutatorConditionContainerVarName in src.literal.textures
    let holds
    if (c.m_nMutatorCondition.endsWith('VALUE_EXISTS')) holds = has
    else if (c.m_nMutatorCondition.endsWith('VALUE_EQUALS')) holds = String(src.literal.params[c.m_strMutatorConditionContainerVarName]) === c.m_strMutatorConditionContainerVarValue
    else return false
    return c.m_bPassWhenTrue === false ? !holds : holds
  })
  const layersFor = (instructions, initial) => {
    const layers = []
    const init = initial && source(initial)
    if (init?.literal) layers.push(init.literal)
    else if (init?.ref) layers.push({ container: init.ref })
    for (const m of instructions ?? []) {
      if (!conditionsHold(m)) continue
      const t = m.m_nMutatorCommandType
      if (t === 'COMP_MAT_PROPERTY_MUTATOR_COPY_MATCHING_KEYS') {
        const s = source(m.m_strCopyMatchingKeys_InputContainerSrc)
        if (s?.literal) layers.push(s.literal)
        else if (s?.ref) layers.push({ container: s.ref })
      } else if (t === 'COMP_MAT_PROPERTY_MUTATOR_COPY_PROPERTY') {
        const s = source(m.m_strCopyProperty_InputContainerSrc)
        const prop = m.m_strCopyProperty_InputContainerProperty
        const target = m.m_strCopyProperty_TargetProperty
        if (s?.ref) layers.push({ copy: [s.ref, prop, target] })
        else if (s?.literal) {
          if (prop in s.literal.params) layers.push({ params: { [target]: s.literal.params[prop] }, textures: {} })
          else if (s.literal.textures[prop]) layers.push({ params: {}, textures: { [target]: s.literal.textures[prop] } })
        }
      } else if (t === 'COMP_MAT_PROPERTY_MUTATOR_SET_VALUE') {
        const v = m.m_nSetValue_Value
        const x = looseValue(v)
        if (x !== null) layers.push({ params: { [v.m_strName]: Array.isArray(x) && x.length === 1 ? x[0] : x }, textures: {} })
      }
    }
    return layers
  }
  const passes = {}
  const materialLayers = []
  for (const p of kit.procedures) {
    for (const m of p.m_vecPropertyMutators ?? []) {
      if (m.m_nMutatorCommandType === 'COMP_MAT_PROPERTY_MUTATOR_GENERATE_TEXTURE') {
        passes[m.m_strGenerateTexture_TargetParam] = layersFor(m.m_vecTexGenInstructions, m.m_strGenerateTexture_InitialContainer)
      } else if (m.m_nMutatorCommandType === 'COMP_MAT_PROPERTY_MUTATOR_COPY_PROPERTY' || m.m_nMutatorCommandType === 'COMP_MAT_PROPERTY_MUTATOR_SET_VALUE') {
        materialLayers.push(...layersFor([m]))
      }
    }
  }
  return { paint, passes, materialLayers }
}

// ── Draw calls ─────────────────────────────────────────────────────────────────────────────────────────────────────
function drawCall(materialPath) {
  const name = strip(materialPath)
  const mat = materials.get(name)
  if (!mat) return { material: name, missing: true }
  const t = mat.textures
  const call = { material: name, shader: mat.shader, color: tex(t.g_tColor), normal: tex(t.g_tNormal), rough: tex(t.g_tMetalness), ao: tex(t.g_tAmbientOcclusion) }
  if (mat.intAttributes?.left) call.leftAttr = true
  const tint = mat.vectors.g_vColorTint
  const amount = mat.floats.g_flModelTintAmount ?? 1
  if (tint && amount > 0 && (tint[0] !== 1 || tint[1] !== 1 || tint[2] !== 1)) call.tint = tint.slice(0, 3).map((x) => 1 - amount + x * amount)
  const ci = materials.get(compositeInputs(mat) ?? '')
  if (ci) {
    const c = ci.textures
    call.composite = {
      uvScale: ci.floats.g_flUvScale1 ?? 1, weaponLength: ci.floats.g_flWeaponLength1 ?? 32, separateChannels: ci.ints.F_SEPARATE_CHANNEL_INPUTS ?? 0,
      ao: tex(c.g_tAmbientOcclusion), color: tex(c.g_tColor), masks: tex(c.g_tMasks), rough: tex(c.g_tMetalness), pos: tex(c.g_tPosition), surface: tex(c.g_tSurface),
    }
  }
  return call
}
const meshDrawCalls = (info) => Object.fromEntries(info.meshes.map((me) => [me.name, me.drawCalls.map((c) => drawCall(c.material))]))
const glbPath = (m) => m.replace(/\.vmdl$/, '.glb')
/**
 * A model's CTiltTwistConstraints (its key values' BoneConstraintList, bones named by hash): each twist bone takes
 * `weight` × its target's roll about `targetAxis`, measured from `offset` (m_qOffset, xyzw), turned about its own `axis`.
 */
function twistConstraints(info) {
  const text = info.keyValueText
  if (!text) return []
  const names = new Map(info.skeleton.bones.map((b) => [boneHash(b), b]))
  const out = []
  for (const c of parseKv3(text).BoneConstraintList ?? []) {
    if (c._class !== 'CTiltTwistConstraint') continue
    const target = c.m_targets?.[0], slave = c.m_slaves?.[0]
    const bone = names.get(slave?.m_nBoneHash), of = names.get(target?.m_nBoneHash)
    if (!bone || !of) continue
    out.push({ bone, target: of, weight: slave.m_flWeight * (target.m_flWeight ?? 1), targetAxis: c.m_nTargetAxis ?? 0, axis: c.m_nSlaveAxis ?? 0, offset: target.m_qOffset })
  }
  return out
}
/** A parent transform (t, q xyzw) times a child's: the child in the parent's parent's space. */
function composeTq(t, q, ct, cq) {
  const [x, y, z, w] = q, [a, b, c, d] = cq
  const rotate = ([vx, vy, vz]) => {
    const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]
  }
  const r = rotate(ct)
  return [[t[0] + r[0], t[1] + r[1], t[2] + r[2]], [w * a + x * d + y * c - z * b, w * b - x * c + y * d + z * a, w * c + x * b - y * a + z * d, w * d - x * a - y * b - z * c]]
}
const skeleton = (info) => ({ bones: info.skeleton.bones, parents: info.skeleton.parents, pos: info.skeleton.pos, rot: info.skeleton.rot, twists: twistConstraints(info) })

// ── Viewer JSON ────────────────────────────────────────────────────────────────────────────────────────────────────
const index = { items: {}, skins: [] }
const written = []

for (const { def, kits } of knives) {
  const info = modelInfo(def.model_player)
  const meshes = meshDrawCalls(info)
  const displayName = tr(def.item_name)
  index.items[def.name] = { displayName, type: 'Knife', glb: true, meshes: Object.keys(meshes), defindex: def.index }
  written.push(writeJson(`items/${def.name}.json`, {
    name: def.name, displayName, type: 'Knife', class: def.name, glb: glbPath(def.model_player), meshes, stickerSlots: [], keychainAnchors: [],
  }))
  for (const kit of kits) {
    let data
    try {
      data = kit.vanilla ? vanillaKit() : knifeKit(kit)
    } catch (e) { fail(def.name, kit.name, 'kit', e); continue }
    written.push(writeJson(`kits/${kit.name}.json`, data))
    index.skins.push({
      item: def.name, kit: kit.name, name: data.displayName, paintIndex: kit.index, style: data.style,
      shader: data.shader, rarity: kit.rarity, floatMin: data.floatMin, floatMax: data.floatMax, render: '',
    })
  }
}

/** A knife's paint kit: the vcompmat's passes, layers and rolls over its paint material. */
function knifeKit(kit) {
  const paintMat = materials.get(kit.paint)
  const { paint, passes, materialLayers } = kitPasses(kit, paintMat)
  const { rolls, groups } = kitRolls(kit)
  const params = { ...paint.params }
  for (const c of Object.values(kit.containers)) Object.assign(params, looseParams(c))
  return {
    name: kit.name, displayName: kitDisplayName(kit), index: kit.index, rarity: kit.rarity,
    floatMin: Number(kit.wear_remap_min ?? 0), floatMax: Number(kit.wear_remap_max ?? 1),
    legacyModel: kit.use_legacy_model === '1', shader: paintMat.shader, style: paintMat.ints.F_PAINT_STYLE ?? null,
    params, textures: paint.textures, rolls, rollGroups: groups, passes, materialLayers,
  }
}
/**
 * A knife without a finish (the catalog's vanilla knives): no paint kit, so the viewer draws the model's own materials
 * (its "bare" style). Paint index 0, as inspect links give a vanilla knife.
 */
function vanillaKit() {
  return {
    name: VANILLA, displayName: 'Vanilla', index: 0, rarity: null, floatMin: 0, floatMax: 1, legacyModel: false,
    shader: null, style: null, params: {}, textures: sharedWear(), rolls: [],
  }
}
/** The weapon-wide wear and grunge every weapon finish's paint names (the bare style samples them, unpainted). */
function sharedWear() {
  for (const k of knives) for (const kit of k.kits) {
    const t = materials.get(kit.paint)?.textures
    const wear = tex(t?.g_tWear), grunge = tex(t?.g_tGrunge)
    if (wear && grunge) return { g_tWear: wear, g_tGrunge: grunge }
  }
  return {}
}

const armsModels = {}
/** The textures the newer gloves' compositor reads averages of. */
const averaged = new Set()
for (const { def, kits } of gloves) {
  const info = modelInfo(def.model_player)
  const meshes = meshDrawCalls(info)
  const displayName = tr(def.item_name)
  index.items[def.name] = { displayName, type: 'Gloves', glb: true, meshes: Object.keys(meshes), defindex: def.index }
  written.push(writeJson(`items/${def.name}.json`, {
    name: def.name, displayName, type: 'Gloves', class: def.name, glb: glbPath(def.model_player), meshes, stickerSlots: [], keychainAnchors: [],
  }))
  armsModels[def.model_player] = skeleton(info)
  for (const kit of kits) {
    let data
    try {
      data = gloveKit(kit)
    } catch (e) { fail(def.name, kit.name, 'kit', e); continue }
    written.push(writeJson(`kits/${kit.name}.json`, data))
    index.skins.push({
      item: def.name, kit: kit.name, name: data.displayName, paintIndex: kit.index, style: null,
      shader: data.shader, rarity: kit.rarity, floatMin: data.floatMin, floatMax: data.floatMax, render: '',
    })
  }
}
/** A glove paint kit: classic (its paint material) or newer (the vcompmat's passes over the compositor template). */
function gloveKit(kit) {
  const paintMat = materials.get(kit.paint)
  const { rolls, groups } = kitRolls(kit)
  const common = {
    name: kit.name, displayName: kitDisplayName(kit), index: kit.index, rarity: kit.rarity,
    // Glove kits carry no wear range of their own: the game's default for gloves.
    floatMin: Number(kit.wear_remap_min ?? 0.06), floatMax: Number(kit.wear_remap_max ?? 0.8),
    legacyModel: false, shader: 'csgo_customglove.vfx', style: null,
  }
  if (!kit.compositor) return { ...common, shader: paintMat.shader, params: materialParams(paintMat), textures: materialTextures(paintMat, true), rolls }
  // A newer (v2) glove: the vcompmat's passes over the compositor template and the paint (a csgo_customglove_preview
  // material), the seed's roll groups with their conditions, and the flags those conditions read (bSync…).
  const { passes, materialLayers } = kitPasses(kit, paintMat)
  const params = {}
  for (const c of Object.values(kit.containers)) Object.assign(params, looseParams(c))
  for (const layer of passes.g_tColor) for (const t of Object.values(layer.textures ?? {})) averaged.add(t)
  return { ...common, params, textures: {}, rolls, rollGroups: groups, passes: { g_tColor: passes.g_tColor }, materialLayers, compositor: kit.compositor }
}
written.push(writeJson('index.json', index))
written.push(writeJson('texture_average.json', Object.fromEntries([...averaged].sort().filter((t) => textureAverages[t]).map((t) => [t, textureAverages[t]]))))

// Agents: their models' first-person groups and skeleton. First person loads glb, a copy of the model with only its
// first-person meshes (<model>.fp.glb); the third-person agent view loads body, the whole model.
const agentIndex = { agents: [], models: {} }
for (const a of agents) {
  const info = modelInfo(a.model_player)
  const key = path.basename(a.model_player, '.vmdl')
  const fpGlb = glbPath(a.model_player).replace(/\.glb$/, '.fp.glb')
  try {
    if (filterGlb(path.join(GAME_ROOT, glbPath(a.model_player)), insideRoot(EXTRACTED, path.join(GAME_ROOT, fpGlb)), (name) => /\.firstperson_[^.]*$/.test(name))) rewritten.push(fpGlb)
  } catch (e) { fail(a.name, null, 'first-person model', e); continue }
  agentIndex.models[key] = { glb: fpGlb, body: glbPath(a.model_player), skeleton: skeleton(info), drawCalls: meshDrawCalls(info) }
  const team = a.used_by_classes?.terrorists ? 't' : 'ct'
  agentIndex.agents.push({ id: a.name, index: a.index, name: tr(a.item_name), model: key, team, rarity: a.item_rarity ?? null })
}
written.push(writeJson('agents.json', agentIndex))

// First person: the knife's pose (its idle's first frame), its inspect, its own skeleton and bind, and the glove skeletons.
const fp = { index: {}, inspect: {}, idle: {}, attack: {} }
const weaponSkeletons = {}, weaponBinds = {}
for (const [item, c] of Object.entries(firstPerson)) {
  const def = itemDef(item)
  const info = modelInfo(def.model_player)
  weaponSkeletons[glbPath(def.model_player)] = skeleton(info)
  // The model-space bind of the bone the knife hangs from (weapon_offset): its mesh is authored around it.
  const s = info.skeleton
  const hang = Math.max(0, s.bones.indexOf('weapon_offset'))
  const chain = []
  for (let b = hang; b >= 0; b = s.parents[b]) chain.unshift(b)
  weaponBinds[item] = chain.reduce(([t, q], b) => composeTq(t, q, s.pos[b], s.rot[b]), [[0, 0, 0], [0, 0, 0, 1]])

  const idle = readJson(workFile(clipPath(item, c.idle), '.json'))
  const frame0 = (track, n) => track.slice(0, n)
  /** The knife's own track in a clip: its secondary animation on a weapon skeleton (weapon, weapon_offset, econ). */
  const weaponTrack = (clip) => (clip.secondary ?? []).find((x) => /skeletons\/weapons\//.test(x.skeletonName))
  const poseFile = `poses/${item}.json`
  const idleWeapon = weaponTrack(idle)
  written.push(writeJson(`firstperson/${poseFile}`, {
    clip: c.idle,
    viewmodel: { bones: idle.bones, parents: idle.parents, pose: idle.tracks.map(([t, q]) => [frame0(t, 3), frame0(q, 4), 1]) },
    ...(idleWeapon && { weapon: { bones: idleWeapon.bones, parents: idleWeapon.parents, pose: idleWeapon.tracks.map(([t, q]) => [frame0(t, 3), frame0(q, 4), 1]), skeleton: idleWeapon.skeletonName } }),
  }))
  fp.index[item] = poseFile
  const asClip = (clip, name) => {
    const w = weaponTrack(clip)
    return {
      clip: name, duration: clip.duration, frames: clip.frames, viewmodel: { bones: clip.bones, parents: clip.parents, tracks: clip.tracks },
      ...(w && { weapon: { bones: w.bones, parents: w.parents, tracks: w.tracks, skeleton: w.skeletonName } }),
    }
  }
  written.push(writeJson(`firstperson/idle/${item}.json`, asClip(idle, c.idle)))
  fp.idle[poseFile] = `${item}.json`
  if (c.inspect) {
    const inspect = readJson(workFile(clipPath(item, c.inspect), '.json'))
    written.push(writeJson(`firstperson/inspect/${item}.json`, asClip(inspect, c.inspect)))
    fp.inspect[item] = `${item}.json`
  }
  for (const a of c.attacks) {
    const clip = readJson(workFile(clipPath(item, a.clip), '.json'))
    written.push(writeJson(`firstperson/attack/${item}/${a.name}.json`, asClip(clip, a.clip)))
  }
  if (c.attacks.length) fp.attack[item] = c.attacks.map((a) => ({ name: a.name, file: `${item}/${a.name}.json` }))
}
written.push(writeJson('firstperson/index.json', fp.index))
written.push(writeJson('firstperson/inspect_index.json', fp.inspect))
written.push(writeJson('firstperson/idle_index.json', fp.idle))
written.push(writeJson('firstperson/weapon_skeletons.json', weaponSkeletons))
written.push(writeJson('firstperson/weapon_binds.json', weaponBinds))
written.push(writeJson('firstperson/arms_models.json', armsModels))
// The swings: { [item]: { name, file }[] }, the files under firstperson/attack/. Agent patch slots aren't built: an
// empty index, so the viewer doesn't ask for files that aren't there. The glove inspect clips are fetched only when
// inspect_index.json lists them (gloves_deploy, gloves_anim).
written.push(writeJson('firstperson/attack_index.json', fp.attack))
written.push(writeJson('agent_patches.json', {}))
const firstGlove = Object.values(armsModels)[0]
if (firstGlove) written.push(writeJson('firstperson/arms.json', firstGlove))

// Catalogs outside this project's scope (stickers, charms, pins, patches, pets): empty, so the viewer loads. The inspect
// maps (maps.json, scenes.json) are build-maps.mjs's.
for (const [file, empty] of Object.entries({
  'stickers.json': { scratches: '', stickers: [] }, 'charms.json': { charms: [] }, 'pins.json': { pins: [], models: {} },
  'patches.json': { patches: [], card: { color: '', normal: '' } }, 'pets.json': { pets: [], models: {} }, 'pets/anim_index.json': { skeletons: {}, clips: [] },
})) written.push(writeJson(file, empty))

// ── Sizes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A file's size; a texture's WebP when compress.mjs has made one (the viewer loads it first). */
const size = (f) => { const webp = f.replace(/\.png$/, '.webp'); return existsSync(webp) && statSync(webp).mtimeMs >= statSync(f).mtimeMs ? statSync(webp).size : existsSync(f) ? statSync(f).size : 0 }
const mb = (n) => (n / 1048576).toFixed(1) + ' MB'
const sumFiles = (files) => [...new Set(files)].reduce((s, f) => s + size(f), 0)
const gameFile = (rel) => path.join(GAME_ROOT, rel)
const texturesOf = (mats) => mats.flatMap((m) => Object.values(materials.get(strip(m))?.textures ?? {}).map((t) => tex(t)).filter(Boolean).map(gameFile))
const report = {}
for (const { def, kits } of [...knives, ...gloves]) {
  const info = modelInfo(def.model_player)
  const mats = info.meshes.flatMap((me) => me.drawCalls.map((c) => c.material))
  const ci = mats.map((m) => compositeInputs(materials.get(strip(m)))).filter(Boolean)
  report[def.name] = { model: mb(size(gameFile(glbPath(def.model_player)))), textures: mb(sumFiles(texturesOf([...mats, ...ci]))) }
  for (const kit of kits) if (!kit.vanilla) report[`${def.name} | ${kit.name}`] = { textures: mb(sumFiles(texturesOf([kit.paint]))) }
}
for (const a of agents) {
  const info = modelInfo(a.model_player)
  const fpMats = info.meshes.filter((me) => /^firstperson/.test(me.name)).flatMap((me) => me.drawCalls.map((c) => c.material))
  report[a.name] = { model: mb(size(gameFile(glbPath(a.model_player).replace(/\.glb$/, '.fp.glb')))), firstPersonTextures: mb(sumFiles(texturesOf(fpMats))) }
}
writeIfChanged(path.join(WORK, 'sizes.json'), JSON.stringify(report, null, 2))

// ── What was built, what failed, what changed ──────────────────────────────────────────────────────────────────────
const built = {
  knives: knives.map((k) => ({ item: k.def.name, defindex: k.def.index, kits: k.kits.map((x) => x.name).filter((n) => index.skins.some((s) => s.item === k.def.name && s.kit === n)) })),
  gloves: gloves.map((g) => ({ item: g.def.name, defindex: g.def.index, kits: g.kits.map((x) => x.name).filter((n) => index.skins.some((s) => s.item === g.def.name && s.kit === n)) })),
  agents: agentIndex.agents.map((a) => ({ item: a.id, defindex: a.index })),
}
/**
 * What the game files have that the catalog doesn't: knife and glove finishes with an item image of their own
 * (panorama/images/econ/default_generated/<item>_<kit>_light_png, the picture the game and Steam show), and agents
 * (items_game's customplayer_* items).
 */
function gameOnly() {
  const inCatalog = new Set(list.entries.filter((e) => e.item && e.kit).map((e) => `${e.item}|${e.kit}`))
  const itemNames = [...new Set(list.entries.filter((e) => e.item && e.category !== 'Agents').map((e) => e.item))].sort((a, b) => b.length - a.length)
  const kitNames = new Set(Object.values(IG.paint_kits).map((k) => k.name))
  const finishes = []
  for (const f of FILES) {
    const m = /^panorama\/images\/econ\/default_generated\/(.+)_light_png\.vtex_c$/.exec(f)
    if (!m) continue
    const item = itemNames.find((n) => m[1].startsWith(n + '_'))
    if (!item) continue
    const kit = m[1].slice(item.length + 1)
    if (!kitNames.has(kit)) continue
    if (!inCatalog.has(`${item}|${kit}`)) finishes.push(`${item}|${kit}`)
  }
  const catalogAgents = new Set(list.agents)
  const agentsOnly = Object.entries(IG.items).filter(([, d]) => /^customplayer_/.test(d.name ?? '') && !catalogAgents.has(d.name))
    .map(([i, d]) => ({ item: d.name, defindex: Number(i), name: tr(d.item_name) || null, model: d.model_player ?? null }))
  return { finishes: finishes.sort(), agents: agentsOnly }
}
writeIfChanged(path.join(WORK, 'build-report.json'), JSON.stringify({
  catalog: config.catalog, partial: !!only, built, failures, gameOnly: only ? null : gameOnly(),
  // Catalog entries the game files don't resolve, and the build list with its keys.
  catalogProblems: list.problems, catalogEntries: list.entries,
  missingTextures: [...missingTextures].sort(),
}, null, 1))
const redone = changes()
const sourceChanged = sourceChanges && sourceChanges.added.length + sourceChanges.changed.length + sourceChanges.removed.length > 0
// Written only by a run that found or did something: changes.json describes the last build that changed anything.
if (redone.length || rewritten.length || sourceChanged) writeIfChanged(path.join(WORK, 'changes.json'), JSON.stringify({
  at: new Date().toISOString(),
  // Files of pak01 added, removed or changed (by CRC32) since the index the last build kept; null on the first build.
  source: sourceChanges && { added: sourceChanges.added.length, removed: sourceChanges.removed.length, changed: sourceChanges.changed.length, files: [...sourceChanges.added, ...sourceChanges.changed, ...sourceChanges.removed].slice(0, 2000) },
  redone, rewritten,
}, null, 1))
const skins = index.skins.length
console.log(`build: ${Object.keys(index.items).length} items, ${skins} finishes, ${agentIndex.agents.length} agents; ${failures.length} failed`)
console.log(`  ${redone.length} files decoded again, ${rewritten.length} of ${written.length} viewer files rewritten, ${((Date.now() - started) / 1000).toFixed(1)} s`)
if (sourceChanged) console.log(`  pak01 since the last build: ${sourceChanges.added.length} added, ${sourceChanges.changed.length} changed, ${sourceChanges.removed.length} removed (work/changes.json)`)

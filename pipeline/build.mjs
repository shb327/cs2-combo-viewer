// Builds the viewer's data for the items in items.json from the copied game files.
//
//   node build.mjs [--items items.json]
//
// Reads only the copies (C:/cs2-data/source, through the C# tool) and writes only under C:/cs2-data/extracted:
//   work/                  intermediate files (model and material dumps, items_game, localization)
//   web/extracted/game/    models (.glb) and textures (.png, .exr) at their game paths
//   web/extracted/viewer/  the viewer's JSON: index, items, kits, agents, first person
// Run convert-shaders.mjs (after shader-dump) for the compositing shaders.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extract, PAK01, runTool } from './lib/extract.mjs'
import { parseKv1, parseLocalization } from './lib/kv1.mjs'
import { boneHash, parseKv3 } from './lib/kv3.mjs'
import { EXTRACTED, GAME_ROOT, VIEWER_DATA, insideRoot, parseArgs } from './lib/paths.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
const config = JSON.parse(readFileSync(args.items ?? path.join(here, 'items.json'), 'utf8'))
const WORK = path.join(EXTRACTED, 'work')
mkdirSync(WORK, { recursive: true })

const strip = (p) => p.replace(/_c$/, '')
const workFile = (gamePath, ext) => path.join(WORK, 'files', strip(gamePath) + ext)
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const writeJson = (rel, data) => {
  const f = insideRoot(EXTRACTED, path.join(VIEWER_DATA, rel))
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify(data))
  return f
}

// ── The game's file list, items_game and the localization ──────────────────────────────────────────────────────────
const listFile = path.join(WORK, 'pak01_files.txt')
if (!existsSync(listFile)) runTool(['list', '--vpk', PAK01, '--out', listFile])
const FILES = new Set(readFileSync(listFile, 'utf8').split('\n').filter(Boolean))
const findCompiled = (suffix) => [...FILES].filter((f) => f.endsWith(suffix)).map(strip)

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
/** The kit's name (the viewer adds a Doppler or Gamma Doppler phase itself, from the kit name). */
const kitDisplayName = (kit) => tr(kit.description_tag)

// ── Round 1: models, kit composite materials, clips ────────────────────────────────────────────────────────────────
const knives = Object.entries(config.knives).map(([name, kits]) => ({ def: itemDef(name), kits: kits.map(paintKit) }))
const gloves = Object.entries(config.gloves).map(([name, kits]) => ({ def: itemDef(name), kits: kits.map(paintKit) }))
const agents = config.agents.map(itemDef)
const kitCompmat = (kit, folder) => {
  const found = findCompiled(`/${kit.name}.vcompmat_c`).filter((f) => f.startsWith(folder))
  if (found.length !== 1) throw new Error(`${kit.name}: ${found.length} vcompmat files under ${folder}`)
  return found[0]
}
for (const k of knives) for (const kit of k.kits) kit.compmat = kitCompmat(kit, 'weapons/paints/')
for (const g of gloves) for (const kit of g.kits) kit.compmat = kitCompmat(kit, 'gloves/paints/')

const models = [...knives.map((k) => k.def.model_player), ...gloves.map((g) => g.def.model_player), ...agents.map((a) => a.model_player)]
const clipPath = (item, clip) => `animation/anims/viewmodel/knife/${item.replace(/^weapon_/, '')}/${clip}.vnmclip`
const clips = Object.entries(config.firstPerson ?? {}).flatMap(([item, c]) => [c.idle, c.inspect].filter(Boolean).map((x) => clipPath(item, x)))
const kvFiles = new Map()
const loadKv = (paths, round) => {
  const todo = paths.filter((p) => !kvFiles.has(p))
  const r = extract(todo.map((p) => ({ kind: 'kv', path: p, out: workFile(p, '.json') })), path.join(WORK, round))
  for (const p of todo) {
    const e = r.get(p)
    if (e?.error) throw new Error(`${p}: ${e.error}`)
    kvFiles.set(p, readJson(e.out))
  }
}
{
  const r = extract([
    ...models.map((m) => ({ kind: 'model', path: m, out: path.join(GAME_ROOT, m.replace(/\.vmdl$/, '.json')) })),
    ...clips.map((c) => ({ kind: 'clip', path: c, out: workFile(c, '.json') })),
  ], path.join(WORK, 'jobs-1'))
  for (const [p, e] of r) if (e.error) throw new Error(`${p}: ${e.error}`)
}
const modelInfo = (m) => readJson(path.join(GAME_ROOT, m.replace(/\.vmdl$/, '.json')))
const allKits = [...knives, ...gloves].flatMap((x) => x.kits)

// ── Round 2: kit includes (recursive), paint materials, model materials ────────────────────────────────────────────
loadKv(allKits.map((k) => k.compmat), 'jobs-2')
for (let depth = 0; depth < 4; depth++) {
  const includes = [...kvFiles.values()].flatMap((doc) => procedures(doc).flatMap((p) => p.m_vecCompMatIncludes ?? [])).map(strip).filter((p) => !kvFiles.has(p))
  if (!includes.length) break
  loadKv(includes, `jobs-2-${depth}`)
}
/** A vcompmat's assembly procedures, its includes' first. */
function procedures(doc) {
  return (doc.m_Points ?? []).flatMap((pt) => pt.m_vecCompositeMaterialAssemblyProcedures ?? [])
}
function allProcedures(compmat) {
  const doc = kvFiles.get(compmat)
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
for (const kit of allKits) {
  kit.procedures = allProcedures(kit.compmat)
  kit.containers = containers(kit.procedures)
  kit.paint = strip(kit.containers.paint?.m_strSpecificContainerMaterial ?? '')
  if (!kit.paint) throw new Error(`${kit.name}: no paint material in its vcompmat`)
}
const modelMaterials = models.flatMap((m) => modelInfo(m).meshes.flatMap((me) => me.drawCalls.map((c) => c.material)))
loadMaterials([...allKits.map((k) => k.paint), ...modelMaterials], 'jobs-3')

// ── Round 3: the knives' composite inputs ──────────────────────────────────────────────────────────────────────────
const compositeInputs = (mat) => (mat?.attributes?.composite_inputs ? strip(mat.attributes.composite_inputs) : null)
loadMaterials(modelMaterials.map((m) => compositeInputs(materials.get(strip(m)))).filter(Boolean), 'jobs-4')

// ── Round 4: textures ──────────────────────────────────────────────────────────────────────────────────────────────
const textureFiles = new Map()
{
  const wanted = new Set()
  for (const m of materials.values()) for (const t of Object.values(m.textures)) wanted.add(strip(t))
  const r = extract([...wanted].filter((t) => FILES.has(t + '_c')).map((t) => ({ kind: 'texture', path: t, out: path.join(GAME_ROOT, t.replace(/\.vtex$/, '.png')) })), path.join(WORK, 'jobs-5'))
  for (const [p, e] of r) {
    if (e.error) { console.warn(`  texture ${p}: ${e.error}`); continue }
    textureFiles.set(p, path.relative(GAME_ROOT, e.out).replace(/\\/g, '/'))
  }
  const missing = [...wanted].filter((t) => !textureFiles.has(t))
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
    groups.push({ seed: (m.m_strRandomRollInputVars_SeedInputVar ?? '').split('.').pop() || 'g_nRandomSeed', vars, when: [] })
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
    if (c?.m_vecLooseVariables) return { literal: { params: looseParams(c), textures: {} } }
    return null
  }
  const conditionsHold = (m) => (m.m_vecConditions ?? []).every((c) => {
    const alias = c.m_strMutatorConditionContainerName
    // Conditions on the item's own containers are left to the runtime layers they guard (always copied there).
    if (alias === 'composite_inputs' || alias === 'target') return false
    const src = source(alias)
    if (!src?.literal) return false
    const has = c.m_strMutatorConditionContainerVarName in src.literal.params || c.m_strMutatorConditionContainerVarName in src.literal.textures
    if (c.m_nMutatorCondition.endsWith('VALUE_EXISTS')) return has
    if (c.m_nMutatorCondition.endsWith('VALUE_EQUALS')) return String(src.literal.params[c.m_strMutatorConditionContainerVarName]) === c.m_strMutatorConditionContainerVarValue
    return false
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
    const paintMat = materials.get(kit.paint)
    const { paint, passes, materialLayers } = kitPasses(kit, paintMat)
    const { rolls, groups } = kitRolls(kit)
    const params = { ...paint.params }
    for (const c of Object.values(kit.containers)) Object.assign(params, looseParams(c))
    const data = {
      name: kit.name, displayName: kitDisplayName(kit), index: kit.index, rarity: kit.rarity,
      floatMin: Number(kit.wear_remap_min ?? 0), floatMax: Number(kit.wear_remap_max ?? 1),
      legacyModel: kit.use_legacy_model === '1', shader: paintMat.shader, style: paintMat.ints.F_PAINT_STYLE ?? null,
      params, textures: paint.textures, rolls, rollGroups: groups, passes, materialLayers,
    }
    written.push(writeJson(`kits/${kit.name}.json`, data))
    index.skins.push({
      item: def.name, kit: kit.name, name: `${displayName} | ${data.displayName}`, paintIndex: kit.index, style: data.style,
      shader: data.shader, rarity: kit.rarity, floatMin: data.floatMin, floatMax: data.floatMax, render: '',
    })
  }
}

const armsModels = {}
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
    const paintMat = materials.get(kit.paint)
    const { rolls } = kitRolls(kit)
    const classic = !paintMat.ints.F_BACKWARDS_COMPATIBILITY
    if (!classic) console.warn(`  ${kit.name}: a newer (v2) glove paint; only classic gloves are built so far`)
    const data = {
      name: kit.name, displayName: kitDisplayName(kit), index: kit.index, rarity: kit.rarity,
      // Glove kits carry no wear range of their own: the game's default for gloves.
      floatMin: Number(kit.wear_remap_min ?? 0.06), floatMax: Number(kit.wear_remap_max ?? 0.8),
      legacyModel: false, shader: paintMat.shader, style: null,
      params: materialParams(paintMat), textures: materialTextures(paintMat, true), rolls,
    }
    written.push(writeJson(`kits/${kit.name}.json`, data))
    index.skins.push({
      item: def.name, kit: kit.name, name: `${displayName} | ${data.displayName}`, paintIndex: kit.index, style: null,
      shader: data.shader, rarity: kit.rarity, floatMin: data.floatMin, floatMax: data.floatMax, render: '',
    })
  }
}
written.push(writeJson('index.json', index))

// Agents: their models' first-person groups and skeleton.
const agentIndex = { agents: [], models: {} }
for (const a of agents) {
  const info = modelInfo(a.model_player)
  const key = path.basename(a.model_player, '.vmdl')
  agentIndex.models[key] = { glb: glbPath(a.model_player), body: glbPath(a.model_player), skeleton: skeleton(info), drawCalls: meshDrawCalls(info) }
  const team = a.used_by_classes?.terrorists ? 't' : 'ct'
  agentIndex.agents.push({ id: a.name, index: a.index, name: tr(a.item_name), model: key, team, rarity: a.item_rarity ?? null })
}
written.push(writeJson('agents.json', agentIndex))

// First person: the knife's pose (its idle's first frame), its inspect, its own skeleton and bind, and the glove skeletons.
const fp = { index: {}, inspect: {}, idle: {} }
const weaponSkeletons = {}, weaponBinds = {}
for (const [item, c] of Object.entries(config.firstPerson ?? {})) {
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
}
written.push(writeJson('firstperson/index.json', fp.index))
written.push(writeJson('firstperson/inspect_index.json', fp.inspect))
written.push(writeJson('firstperson/idle_index.json', fp.idle))
written.push(writeJson('firstperson/weapon_skeletons.json', weaponSkeletons))
written.push(writeJson('firstperson/weapon_binds.json', weaponBinds))
written.push(writeJson('firstperson/arms_models.json', armsModels))
const firstGlove = Object.values(armsModels)[0]
if (firstGlove) written.push(writeJson('firstperson/arms.json', firstGlove))

// Catalogs outside this project's scope (stickers, charms, pins, patches, pets): empty, so the viewer loads. The inspect
// maps (maps.json, scenes.json) are build-maps.mjs's.
for (const [file, empty] of Object.entries({
  'stickers.json': { scratches: '', stickers: [] }, 'charms.json': { charms: [] }, 'pins.json': { pins: [], models: {} },
  'patches.json': { patches: [], card: { color: '', normal: '' } }, 'pets.json': { pets: [], models: {} }, 'pets/anim_index.json': { skeletons: {}, clips: [] },
})) written.push(writeJson(file, empty))

// ── Sizes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const size = (f) => (existsSync(f) ? statSync(f).size : 0)
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
  for (const kit of kits) report[`${def.name} | ${kit.name}`] = { textures: mb(sumFiles(texturesOf([kit.paint]))) }
}
for (const a of agents) {
  const info = modelInfo(a.model_player)
  const fpMats = info.meshes.filter((me) => /^firstperson/.test(me.name)).flatMap((me) => me.drawCalls.map((c) => c.material))
  report[a.name] = { model: mb(size(gameFile(glbPath(a.model_player)))), firstPersonTextures: mb(sumFiles(texturesOf(fpMats))) }
}
writeFileSync(path.join(WORK, 'sizes.json'), JSON.stringify(report, null, 2))
console.log(`build: ${written.length} viewer files in ${VIEWER_DATA}`)
console.table(report)

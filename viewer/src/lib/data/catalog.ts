import type { Item, PaintParams, Rgb, Vec4 } from '@/lib/data/items'
import type { Vmat } from '@/lib/materials/glove'

/** Where the viewer data and the decoded game files live (relative to the asset base). */
export const VIEWER_DATA = 'extracted/viewer/'
export const GAME_ROOT = 'extracted/game/'

export interface CatalogSkin {
  item: string
  kit: string
  name: string
  /** The paint kit's index (inspect links' paintindex). */
  paintIndex?: number
  /** F_PAINT_STYLE (0 solid … 8 gunsmith), null for gloves. */
  style: number | null
  shader: string | null
  rarity: string | null
  floatMin: number
  floatMax: number
  render: string
}

export interface CatalogIndex {
  items: Record<string, { displayName: string; type: string; glb: boolean; meshes: string[]; defindex?: number }>
  skins: CatalogSkin[]
}

/** One draw call of a mesh: its material's textures and the composite inputs it names. */
export interface DrawCall {
  material: string
  /** The material's shader (agents: csgo_character.vfx). */
  shader?: string
  missing?: boolean
  color?: string | null
  normal?: string | null
  rough?: string | null
  ao?: string | null
  /** Anisotropic cloth (csgo_character F_ANISOTROPIC_GLOSS): its roughness is this texture's R, not the normal's alpha. */
  aniso?: string | null
  /** The material's color tint (g_vColorTint × g_flModelTintAmount, sRGB), multiplying the color texture. */
  tint?: [number, number, number]
  stickerMask?: string | null
  stickerScratches?: string | null
  sticker?: boolean
  /** Glove hand materials: the model material's "left" attribute (the hand the vcompmat flips against the paint). */
  leftAttr?: boolean
  composite?: {
    uvScale: number; weaponLength?: number; separateChannels?: number; ao?: string | null; color?: string | null
    masks?: string | null; rough?: string | null; pos?: string | null; surface?: string | null
  } | null
}

export interface StickerSlot { index: number; mesh: string; legacy: boolean; offset: [number, number]; scale: number; rotation: number }
export interface KeychainAnchor { legacy: boolean; bone: string; default: boolean; corners: number[][] }

export interface ItemData {
  name: string
  displayName: string
  type: string
  class: string
  glb: string | null
  meshes: Record<string, DrawCall[]>
  stickerSlots: StickerSlot[]
  keychainAnchors: KeychainAnchor[]
}

export type ParamValue = number | boolean | number[] | string
export interface KitRoll { var: string; min?: number[]; max?: number[]; fixed?: boolean }

/** A condition of a roll group: a container's variable compared with a value (negated when `not`). */
export interface KitRollCondition { container: string; var: string; value: string; not: boolean }

/**
 * One random-roll mutator of the kit's vcompmat, in order: it restarts the random stream from its seed variable
 * (g_nRandomSeed or g_nRandomSeedAlt) and rolls its variables ("name.xy": one float per component) when all its
 * conditions pass.
 */
export interface KitRollGroup { seed: string; vars: string[]; when: KitRollCondition[] }

/** One step of a vcompmat pass: values, the weapon's container, or one property copied from it. */
export type KitLayer = { params: Record<string, ParamValue>; textures: Record<string, string | null> } | { container: string } | { copy: [string, string, string] }
export interface PassInputs { params: Record<string, ParamValue>; textures: Record<string, string> }

/** A pass's parameters and textures: its layers in order (texture paths made absolute). */
function applyLayers(layers: KitLayer[], sources: Record<string, { params: Record<string, ParamValue>; textures: Record<string, string | null | undefined> }>): PassInputs {
  const out: PassInputs = { params: {}, textures: {} }
  const addTextures = (t: Record<string, string | null | undefined>) => { for (const [k, v] of Object.entries(t)) if (v) out.textures[k] = GAME_ROOT + v }
  for (const layer of layers) {
    if ('container' in layer) {
      const src = sources[layer.container]
      if (src) { Object.assign(out.params, src.params); addTextures(src.textures) }
    } else if ('copy' in layer) {
      const [alias, prop, target] = layer.copy
      const src = sources[alias]
      if (!src) continue
      if (prop in src.params) out.params[target] = src.params[prop]
      else if (src.textures[prop]) out.textures[target] = GAME_ROOT + src.textures[prop]
    } else {
      Object.assign(out.params, layer.params)
      addTextures(layer.textures)
    }
  }
  return out
}

export interface KitData {
  name: string
  displayName: string
  index: number
  rarity: string | null
  floatMin: number
  floatMax: number
  legacyModel: boolean
  shader: string | null
  style: number | null
  params: Record<string, ParamValue>
  textures: Record<string, string | null>
  rolls: KitRoll[]
  rollGroups?: KitRollGroup[]
  /** The variables the kit's own vcompmat declares in instance_params (null: the included container applies whole). */
  instanceVars?: string[] | null
  /** The vcompmat's passes (target texture → layers) and the final material's own values. */
  passes?: Record<string, KitLayer[]>
  /** The glove compositor material, for the newer gloves. */
  compositor?: string | null
  materialLayers?: KitLayer[]
}

export const STYLE_NAMES: Record<number, string> = {
  0: 'Solid color', 1: 'Hydrographic', 2: 'Spray-paint', 3: 'Anodized', 4: 'Anodized multicolor',
  5: 'Anodized airbrush', 6: 'Custom paint', 7: 'Patina', 8: 'Gunsmith',
}
/** Styles the viewer renders (the rest show the bare weapon for now). */
export const PORTED_STYLES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])

export const styleName = (s: { style: number | null; shader: string | null }) =>
  s.shader === 'csgo_customglove.vfx' ? 'Gloves' : s.style !== null ? STYLE_NAMES[s.style] ?? `Style ${s.style}` : 'Unknown'

export const isPorted = (s: { style: number | null; shader: string | null }) =>
  s.shader === 'csgo_customglove.vfx' || (s.style !== null && PORTED_STYLES.has(s.style))

const cache = new Map<string, Promise<unknown>>()
function json<T>(base: string, path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(base + path).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p as Promise<T>
}

export const loadIndex = (base: string) => json<CatalogIndex>(base, VIEWER_DATA + 'index.json')
export const loadItemData = (base: string, name: string) => json<ItemData>(base, `${VIEWER_DATA}items/${name}.json`)
export const loadKitData = (base: string, name: string) => json<KitData>(base, `${VIEWER_DATA}kits/${name}.json`)

const num = (v: ParamValue | undefined, d: number) => (typeof v === 'number' ? v : typeof v === 'boolean' ? +v : d)
const vec = (v: ParamValue | undefined, d: number[]) => (Array.isArray(v) ? v : d)
const tex = (p: string | null | undefined) => (p ? GAME_ROOT + p : undefined)

/**
 * The seed's rolls as the kit's vcompmat declares them: each rolled variable in order, one float per
 * component in [min, max) (a range min = max still consumes its roll); variables declared without bounds
 * still consume one roll per component and keep their fixed value.
 */
export interface KitRollPlan { rolls: KitRoll[]; fixed: Record<string, number[]>; groups?: KitRollGroup[]; flags?: Record<string, string> }

function rollPlan(kit: KitData): KitRollPlan {
  const fixed: Record<string, number[]> = {}
  for (const r of kit.rolls) {
    const v = kit.params[r.var]
    fixed[r.var] = Array.isArray(v) ? v : [num(v, 0)]
  }
  const flags: Record<string, string> = {}
  for (const c of (kit.rollGroups ?? []).flatMap((g) => g.when)) {
    const v = kit.params[c.var]
    if (v !== undefined && !Array.isArray(v)) flags[c.var] = String(typeof v === 'boolean' ? +v : v)
  }
  return { rolls: kit.rolls, fixed, groups: kit.rollGroups, flags }
}

/** Which mesh to use: skins with use_legacy_model → body_legacy, the rest body_hd (when the model has both). */
function pickMesh(item: ItemData, legacy: boolean): string {
  const names = Object.keys(item.meshes)
  const want = legacy ? 'body_legacy' : 'body_hd'
  return names.includes(want) ? want : names.find((n) => /body/.test(n)) ?? names[0]
}

/** Item + paint kit → the viewer's Item (or a bare weapon for the styles not ported yet). */
export function catalogItem(item: ItemData, kit: KitData, seed = 1): Item {
  const main = buildItem(item, kit, seed)
  if (main.style === 'glove' || !main.mesh) return main
  const calls = item.meshes[main.mesh] ?? []
  const first = calls.find((c) => !c.sticker && !c.missing) ?? calls[0]
  const parts: Record<string, Item> = {}
  for (const c of calls) {
    if (c.sticker || c.missing || !c.composite || c === first || c.material === first?.material || /scope/i.test(c.material)) continue
    parts[c.material] = buildItem(item, kit, seed, c)
  }
  return Object.keys(parts).length ? { ...main, parts } : main
}

function buildItem(item: ItemData, kit: KitData, seed = 1, only?: DrawCall): Item {
  const p = kit.params
  const t = kit.textures
  const common = {
    id: `${item.name}|${kit.name}`,
    title: `${item.displayName} | ${kit.displayName}`,
    subtitle: `Paint kit ${kit.index} · ${styleName(kit)} · float ${kit.floatMin} – ${kit.floatMax}`,
    floatMin: kit.floatMin, floatMax: kit.floatMax, seed,
    model: GAME_ROOT + item.glb,
  }

  if (kit.shader === 'csgo_customglove.vfx' && kit.compositor && kit.passes?.g_tColor) {
    const color = applyLayers(kit.passes.g_tColor, {})
    const mat = applyLayers(kit.materialLayers ?? [], {})
    return {
      ...common, style: 'glove', vmat: { shader: kit.shader, ints: {}, floats: {}, vectors: {}, textures: {} }, textureRoot: GAME_ROOT,
      drawCalls: item.meshes, v2: { params: color.params, textures: color.textures, material: mat.params, rollPlan: rollPlan(kit) },
    }
  }
  if (kit.shader === 'csgo_customglove.vfx') {
    const vmat: Vmat = { shader: kit.shader, ints: {}, floats: {}, vectors: {}, textures: {} }
    for (const [k, v] of Object.entries(p)) {
      if (Array.isArray(v)) vmat.vectors[k] = [...v, 0, 0, 0, 0].slice(0, 4)
      else if (typeof v === 'boolean') vmat.ints[k] = +v
      else if (typeof v === 'number') (Number.isInteger(v) && /^(F_|g_b|g_n)/.test(k) ? vmat.ints : vmat.floats)[k] = v
    }
    for (const [k, v] of Object.entries(t)) if (v) vmat.textures[k] = v
    const rot = kit.rolls.find((r) => /PatternTexCoordRotation/.test(r.var))
    return {
      ...common, style: 'glove', vmat, textureRoot: GAME_ROOT,
      patternRotation: rot?.min && rot.max && rot.min[0] === rot.max[0] ? rot.min[0] : undefined,
      leftAttrSides: (['left', 'right'] as const).filter((side) =>
        Object.values(item.meshes).some((calls) => calls.some((c) => c.leftAttr && new RegExp(`_${side}\.vmat$`).test(c.material)))),
      drawCalls: item.meshes,
    }
  }

  const meshName = pickMesh(item, kit.legacyModel)
  const calls = item.meshes[meshName] ?? []
  const body = only ?? calls.find((c) => !c.sticker && !c.missing) ?? calls[0]
  const ci = body?.composite
  const weapon = {
    mesh: meshName, drawCalls: item.meshes,
    base: tex(body?.color)!, normal: tex(body?.normal), rough: tex(body?.rough), ao: tex(ci?.ao ?? body?.ao),
    uvScale: ci?.uvScale ?? 1, ignoreWeaponSizeScale: num(p.g_bIgnoreWeaponSizeScale, 0) !== 0,
    wearTexture: tex(t.g_tWear), grungeTexture: tex(t.g_tGrunge),
    rollPlan: rollPlan(kit), patternScale: num(p.g_flPatternTexCoordScale, 1),
    stickerMask: tex(body?.stickerMask), stickerSlots: item.stickerSlots.filter((s) => s.mesh === meshName || !s.mesh),
    keychainAnchors: item.keychainAnchors.filter((a) => a.legacy === (meshName === 'body_legacy')),
    pp: undefined as PaintParams | undefined,
  }
  const v4 = (k: string, d: number) => vec(p[k], [d, d, d, d]).slice(0, 4) as Vec4
  const pp: PaintParams = {
    durability: v4('g_vPaintDurability', 0).map((x) => 1 - x) as Vec4,
    roughness4: v4('g_vPaintRoughness', 0.6), metalness4: v4('g_vPaintMetalness', 0),
    roughPerColor: num(p.F_ROUGHNESS_PER_COLOR, 0) !== 0,
    colorAdjust: num(p.g_nColorAdjustmentMode, 1), wearSoftness: num(p.g_fWearSoftness, 0),
    paintMetalness: num(p.g_flPaintMetalness, 0), brightness: num(p.g_flColorBrightness, 1), paintRoughness: num(p.g_flPaintRoughness, 0.2),
  }
  weapon.pp = pp
  const masks = num(p.g_bOverrideDefaultMasks, 0) && t.g_tPaintByNumberMasks ? tex(t.g_tPaintByNumberMasks) : tex(ci?.masks)
  const colors = [0, 1, 2, 3].map((i) => vec(p[`g_vColor${i}`], [0, 0, 0]).slice(0, 3) as Rgb) as [Rgb, Rgb, Rgb, Rgb]
  const anodized = {
    masks: masks!, colors, brightness: num(p.g_flColorBrightness, 1), paintRoughness: num(p.g_flPaintRoughness, 0.38),
  }
  if (kit.shader === 'csgo_customweapon.vfx' && ci && kit.passes?.g_tColor && kit.passes.g_tMetalness) {
    const sources = {
      composite_inputs: {
        params: { g_flUvScale1: ci.uvScale ?? 1, g_flWeaponLength1: ci.weaponLength ?? 32, F_SEPARATE_CHANNEL_INPUTS: ci.separateChannels ?? 0 },
        textures: {
          g_tAmbientOcclusion: ci.ao, g_tColor: ci.color, g_tMasks: ci.masks, g_tMetalness: ci.rough, g_tPosition: ci.pos, g_tSurface: ci.surface,
        },
      },
      target: { params: {}, textures: { g_tColor: body?.color, g_tMetalness: body?.rough, g_tNormal: body?.normal, g_tAmbientOcclusion: body?.ao } },
    }
    const color = applyLayers(kit.passes.g_tColor, sources)
    const rough = applyLayers(kit.passes.g_tMetalness, sources)
    const mat = applyLayers(kit.materialLayers ?? [], sources)
    const normal = mat.textures.g_tNormal ?? weapon.normal
    return {
      ...common, ...weapon, normal, style: 'composite', styleName: styleName(kit),
      composite: { passes: { color, rough }, material: mat.params, materialTextures: mat.textures },
    }
  }
  switch (kit.style) {
    case 6:
      if (!t.g_tPattern) break
      return {
        ...common, ...weapon, style: 'custom', paint: tex(t.g_tPattern)!,
        paintRoughness: num(p.g_flPaintRoughness, 0.38), wearSoftness: num(p.g_fWearSoftness, 0), paintMetalness: num(p.g_flPaintMetalness, 0),
      }
    case 5:
      if (!t.g_tPattern || !ci?.pos || !ci.surface || !ci.masks) break
      return {
        ...common, ...weapon, ...anodized, style: 'airbrush', paint: tex(t.g_tPattern)!,
        pos: tex(ci.pos)!, surface: tex(ci.surface)!, flipInputs: false,
        patternOffsetX: vec(p.g_vPatternTexCoordOffset, [0, 0])[0],
        sprayBias: [num(p.g_bBiasSpray, 0), ...(vec(p.g_vSprayBlend, [1, 1]).slice(0, 2) as [number, number])],
      }
    case 4:
      if (!t.g_tPattern || !ci?.masks) break
      return { ...common, ...weapon, ...anodized, style: 'multi', paint: tex(t.g_tPattern)!, flipInputs: false }
  }
  const pattern = tex(t.g_tPattern)
  const spray: [number, number, number] = [num(p.g_bBiasSpray, 0), ...(vec(p.g_vSprayBlend, [1, 1]).slice(0, 2) as [number, number])]
  switch (kit.style) {
    case 0: if (masks) return { ...common, ...weapon, style: 'solid', colors, masks }; break
    case 1: if (pattern && masks) return { ...common, ...weapon, style: 'hydro', colors, masks, paint: pattern }; break
    case 2:
      if (pattern && ci?.pos && ci.surface) return { ...common, ...weapon, style: 'spray', colors, paint: pattern, pos: tex(ci.pos), surface: tex(ci.surface), sprayBias: spray }
      break
    case 3: if (masks) return { ...common, ...weapon, style: 'anodized', colors, masks }; break
    case 7: if (pattern && masks) return { ...common, ...weapon, style: 'patina', colors, masks, paint: pattern }; break
    case 8: if (pattern && masks) return { ...common, ...weapon, style: 'gunsmith', colors, masks, paint: pattern }; break
  }
  return { ...common, ...weapon, style: 'bare', styleName: styleName(kit) }
}

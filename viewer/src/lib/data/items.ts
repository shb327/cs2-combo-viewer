
import type { DrawCall, KeychainAnchor, KitRollPlan, StickerSlot } from '@/lib/data/catalog'
import type { Vmat } from '@/lib/materials/glove'
import type { GloveV2Inputs } from '@/lib/materials/glove2'

export type Rgb = [number, number, number]
export type Vec4 = [number, number, number, number]

interface BaseItem {
  id: string
  title: string
  subtitle: string
  floatMin: number
  floatMax: number
  seed: number
  model: string
}

/** Bare weapon textures: color, normal, and either a glTF ORM or a Source "rough" texture. */
interface WeaponTextures {
  /** Composite inputs g_flUvScale1: the weapon's size factor for texture placements (default 1). */
  uvScale?: number
  /** Paint vmat g_bIgnoreWeaponSizeScale: placements aren't multiplied by uvScale (default true: every current paint). */
  ignoreWeaponSizeScale?: boolean
  base: string
  normal?: string
  /** glTF ORM (R = AO, G = roughness, B = metalness), as converted by the CLI. */
  orm?: string
  /** Source "rough" texture — R = roughness, G = metalness (csgo_weapon reads it this way). */
  rough?: string
  /** Weapon composite input, only for the debug views. */
  ao?: string
  /** Which body the skin uses: use_legacy_model → body_legacy, otherwise body_hd. */
  mesh?: 'body_legacy' | 'body_hd' | (string & {})
  /** Each mesh's draw-call materials: the CLI's glb has one primitive per draw call, no materials. */
  drawCalls?: Record<string, DrawCall[]>
  /** The paint's own wear / grunge textures (default: SHARED). */
  wearTexture?: string
  grungeTexture?: string
  /** The seed's rolls as the kit's vcompmat declares them (otherwise the fixed weaponRolls order). */
  rollPlan?: KitRollPlan
  /** g_flPatternTexCoordScale. */
  patternScale?: number
  /** The body's sticker mask (g_tStickerWepInputs), sticker slots and keychain anchors from the model. */
  stickerMask?: string
  stickerSlots?: StickerSlot[]
  keychainAnchors?: KeychainAnchor[]
  /** The paint's csgo_customweapon parameters (catalog kits; otherwise each style's defaults). */
  pp?: PaintParams
  /**
   * Other draw calls of the body that the paint also covers, each with its own composite inputs (a second receiver,
   * the SSG 08's scope body…), by material path. Draw calls with no composite keep their own material.
   */
  parts?: Record<string, Item>
}

/** csgo_customweapon parameters the styles share (a kit's vmat + loose variables, else the shader defaults). */
export interface PaintParams {
  /** The shader's g_vPaintDurability = 1 − the vmat's value (per color: 0 = never wears … 1 = normal). */
  durability: Vec4
  /** g_vPaintRoughness / g_vPaintMetalness per color; per-color roughness only with F_ROUGHNESS_PER_COLOR. */
  roughness4: Vec4
  metalness4: Vec4
  roughPerColor: boolean
  /** g_nColorAdjustmentMode (patina / gunsmith: brightness on the whole pattern, not only the metal). */
  colorAdjust: number
  wearSoftness: number
  paintMetalness: number
  brightness: number
  paintRoughness: number
}

/**
 * Custom paint (F_PAINT_STYLE 6): the paint goes through the UVs. Its alpha (Valve's workshop guide):
 * around 196 = no finish (the skins use 177), 128 and 255 = default wear, below 128 = tougher paint.
 */
export interface CustomPaintItem extends BaseItem, WeaponTextures {
  style: 'custom'
  paint: string
  /** The paint vmat's g_flPaintRoughness (default 0.38), g_fWearSoftness, g_flPaintMetalness (default 0). */
  paintRoughness?: number
  wearSoftness?: number
  paintMetalness?: number
}

/** Shared by the two anodized styles: 4 colors blended by the pattern's R / G / B, metallic. */
interface AnodizedBase extends BaseItem, WeaponTextures {
  paint: string
  /** Composite input: R = where the finish goes (further limited to the weapon's metal parts). */
  masks: string
  /** g_vColor0..3 (sRGB). */
  colors: [Rgb, Rgb, Rgb, Rgb]
  /** g_flColorBrightness — multiplies the colors in linear space. */
  brightness: number
  /** g_flPaintRoughness. */
  paintRoughness: number
  patternScale: number
}

/**
 * Anodized airbrush (F_PAINT_STYLE 5): triplanar projection through the weapon's "pos" composite
 * input (object position per texel, 0–1: x thickness, y length, z height) and the g_tSurface normals.
 * The placement is the shader's g_vPatternTexCoordXform0/1 expression (see patternXform in weapon.ts).
 */
export interface AirbrushItem extends AnodizedBase {
  style: 'airbrush'
  pos: string
  /** Fixed pattern offset x (g_vPatternTexCoordOffset); y is rolled from the seed. */
  patternOffsetX: number
  /** Sample the composite inputs upside down (none of the current weapons need it). */
  flipInputs: boolean
  /** Composite input g_tSurface (object-space normals). */
  surface: string
  /** g_vSprayBiasBlend: (g_bBiasSpray, g_vSprayBlend.x, g_vSprayBlend.y) from the paint's vmat. */
  sprayBias: [number, number, number]
}

/**
 * Anodized multicolor (F_PAINT_STYLE 4): the pattern goes through the UVs (scale, offset 0–1 and
 * rotation 0–360° from the seed); its alpha below 128 is roughness (inverted).
 */
export interface MulticolorItem extends AnodizedBase {
  style: 'multi'
  flipInputs: boolean
}

/**
 * Gloves (csgo_customglove): the game's composite, driven by the glove's own material — its .vmat
 * dumped to JSON (steam-tools/cs2-3d-pipeline/vmat_to_json.py) with every parameter and texture. See materials/glove.ts.
 */
export interface GloveItem extends BaseItem {
  style: 'glove'
  /** The paint's .vmat as JSON (a path to it, or the material itself for catalog gloves). */
  vmat: string | Vmat
  /** Where the vmat's texture paths live (…/x.vtex → textureRoot + …/x.png). */
  textureRoot: string
  /** Fixed pattern rotation in degrees (the skin's vcompmat); otherwise rolled from the seed. */
  patternRotation?: number
  /** The hands whose model material carries the "left" attribute: their g_bFlipFixup is the paint's, inverted. */
  leftAttrSides?: ('left' | 'right')[]
  /** Catalog gloves: the model's draw-call materials (names the hands). */
  drawCalls?: Record<string, DrawCall[]>
  /** The newer gloves (glove compositor, tint ids): the composite's inputs — see materials/glove2.ts. */
  v2?: GloveV2Inputs
}

/**
 * The other csgo_customweapon styles (decompiled combos 0, 1, 2, 3, 7, 8; see weapon.ts): solid color (masks pick
 * colors 0–3), hydrographic (pattern RGB through the UVs picks the colors, layered wear), spray paint (the same,
 * projected from the weapon's position like the airbrush), anodized (color 0 on masks.R), patina and gunsmith
 * (pattern × colors on masks.R, the rest painted / bare).
 */
export interface PaintStyleItem extends BaseItem, WeaponTextures {
  style: 'solid' | 'hydro' | 'spray' | 'anodized' | 'patina' | 'gunsmith'
  colors: [Rgb, Rgb, Rgb, Rgb]
  paint?: string
  masks?: string
  pos?: string
  surface?: string
  sprayBias?: [number, number, number]
}

/**
 * A catalog finish rendered by the game's own composite shader (csgo_customweapon, the kit's static combo; see
 * materials/composite.ts): every style and feature as the game computes it.
 */
export interface CompositeItem extends BaseItem, WeaponTextures {
  style: 'composite'
  /** Each pass's parameters and textures (color, roughness), and the final material's own values (pearlescence…). */
  composite: {
    passes: Record<'color' | 'rough', { params: Record<string, number | boolean | number[] | string>; textures: Record<string, string> }>
    material: Record<string, number | boolean | number[] | string>
    /** The final material's own textures (e.g. g_tGlitterNormal). */
    materialTextures?: Record<string, string>
  }
  /** Paint-style name, for display. */
  styleName: string
}

/** A finish whose style isn't ported yet: the bare weapon. */
export interface BareItem extends BaseItem, WeaponTextures {
  style: 'bare'
  styleName: string
}

export type Item = CustomPaintItem | AirbrushItem | MulticolorItem | PaintStyleItem | CompositeItem | GloveItem | BareItem

/** Textures every weapon finish shares. */
export const SHARED = {
  wear: 'extracted/skin/materials/models/weapons/customization/shared/paint_wear_psd_a2abffd8.png',
  grunge: 'extracted/skin/materials/models/weapons/customization/shared/gun_grunge_psd_f3419fed.png',
}

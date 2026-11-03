import type { StickerDef } from '@/lib/materials/sticker'


/** A sticker slot: the placement in the weapon's sticker UVs (UV1). rotation in turns. */
export interface StickerSlot { offset: [number, number]; scale: number; rotation: number }

export interface WeaponMarkup {
  /** weapon_*_sticker_mask: R = where stickers may go, sampled through UV0. */
  stickerMask: string
  stickerSlots: StickerSlot[]
  /** The "keychain" attachment point (unused now: the anchors below are what the game snaps a charm to). */
  keychain: [number, number, number]
  /** Surface quads (4 corners, model space) a charm hangs from; the charm snaps to the nearest point. */
  keychainAnchors: [number, number, number][][]
  /** The anchor used by default (its center). */
  keychainDefault: number
}

const CH = 'extracted/charm/'

export const MARKUP: Record<string, WeaponMarkup> = {
  ak47: {
    stickerMask: CH + 'weapons/models/ak47/materials/stickers/weapon_rif_ak47_sticker_mask_legacy_tga_1bdb00a.png',
    stickerSlots: [
      { offset: [0.154, -0.438], scale: 15.349997, rotation: 0 },
      { offset: [0.065, -0.432], scale: 15.349997, rotation: 0 },
      { offset: [-0.032, -0.438], scale: 15.349997, rotation: 0 },
      { offset: [-0.164, -0.444], scale: 15.349997, rotation: 0 },
    ],
    keychain: [5.676511, 1.009098, -0.816741],
    keychainAnchors: [
      [[-0.8648, 0.7658, 2.6645], [-0.5161, 0.7474, 2.9639], [8.9878, 0.7527, 2.6613], [8.9873, 0.7439, 2.9703]],
      [[-1.0984, 0.7249, 1.4506], [-1.1074, 0.7249, 2.2356], [9.8331, 0.7249, 1.6978], [9.8302, 0.7249, 2.2497]],
      [[-11.4139, 0.7176, 1.6250], [-4.9764, 0.7176, 1.7611], [-11.5196, 0.7176, -2.2495], [-3.7694, 0.7176, 0.4918]],
      [[-4.7099, 0.7176, 1.5282], [-1.2969, 0.7176, 2.2032], [-3.7826, 0.7176, 0.4577], [-1.2614, 0.7218, 1.4661]],
      [[1.3576, 0.9321, 1.5747], [1.3059, 0.9321, 1.8199], [4.8658, 0.9321, 1.5355], [4.9196, 0.9321, 1.7630]],
      [[2.5656, 0.9321, 1.3113], [2.5119, 0.9321, 1.6158], [3.3993, 0.9321, 1.3130], [3.4402, 0.9321, 1.5584]],
      [[-1.2429, -0.0365, -2.8806], [-1.2474, 0.0228, -2.8775], [-1.2350, -0.0439, -2.9333], [-1.2421, 0.0214, -2.9320]],
      [[24.6128, 0.3322, 3.5909], [24.7781, 0.3322, 3.7243], [24.7814, 0.3322, 3.4087], [24.9497, 0.3322, 3.5837]],
      [[9.2202, 0.4334, 3.1579], [9.2456, 0.4334, 3.5327], [11.7435, 0.4334, 3.0790], [11.7006, 0.4334, 3.5277]],
      [[-0.3696, 0.5447, 3.1337], [-0.1170, 0.4370, 3.3996], [9.0192, 0.5111, 3.1715], [9.0337, 0.4257, 3.4570]],
      [[-0.5019, 0.7460, 2.9680], [-0.3570, 0.5527, 3.1270], [9.0295, 0.6974, 3.0114], [9.0102, 0.5259, 3.1503]],
      [[-1.0375, 0.7658, 2.3419], [-0.8480, 0.7658, 2.6589], [7.4584, 0.7527, 2.3523], [7.4870, 0.7527, 2.6454]],
      [[10.9669, 0.4334, 2.7729], [9.2348, 0.4334, 3.1598], [11.7608, 0.4334, 2.7801], [11.7328, 0.4334, 3.0555]],
      [[9.9375, 0.4334, 2.7544], [9.9353, 0.4334, 2.9716], [10.9269, 0.4334, 2.7794], [10.3106, 0.4334, 2.9211]],
      [[9.2480, 0.4334, 3.5667], [9.9781, 0.4334, 3.7268], [11.7387, 0.4334, 3.5340], [11.7353, 0.4334, 3.7673]],
      [[11.3996, 0.4679, 3.9080], [11.5384, 0.4636, 4.0064], [11.5552, 0.4677, 3.7748], [11.6424, 0.4657, 3.8831]],
      [[4.1335, 0.4275, 0.6018], [4.8028, 0.4275, 0.6229], [4.1648, 0.4276, -0.1572], [4.7311, 0.4275, -0.0421]],
      [[0.1678, 0.3314, 3.6806], [8.9430, 0.3501, 3.6564], [-0.0784, 0.4332, 3.4188], [8.9735, 0.4216, 3.4781]],
      [[10.2916, 0.7284, 2.6946], [12.2803, 0.7256, 2.6887], [10.3206, 0.7279, 1.8810], [11.4972, 0.7262, 1.9005]],
      [[10.2974, 0.7279, 1.8804], [11.5350, 0.7261, 1.9184], [10.3021, 0.7242, 1.4023], [10.5913, 0.7251, 1.3932]],
      [[12.1607, 0.5888, 3.3854], [16.3706, 0.6555, 3.4621], [12.1829, 0.6804, 2.9572], [16.3636, 0.6833, 3.2298]],
      [[12.2296, 0.5093, 3.8026], [16.3985, 0.4610, 3.8147], [12.2035, 0.6718, 3.4034], [16.4077, 0.6564, 3.4464]],
      [[9.2367, 0.5567, 3.0389], [9.8765, 0.5567, 2.9477], [9.3361, 0.5567, 2.5914], [9.8744, 0.5567, 2.5023]],
      [[11.9049, 0.6197, 3.4274], [12.1152, 0.6192, 3.4306], [11.8899, 0.6263, 2.9204], [12.1039, 0.6263, 2.9248]],
      [[11.9005, 0.4974, 3.7624], [12.1130, 0.5053, 3.7545], [11.9062, 0.6200, 3.4256], [12.1145, 0.6200, 3.4252]],
      [[16.4864, 0.4634, 3.7769], [16.7528, 0.4722, 3.7682], [16.4851, 0.6405, 3.3968], [16.7630, 0.6385, 3.4092]],
      [[16.4875, 0.6384, 3.4099], [16.7580, 0.6388, 3.4077], [16.4752, 0.6508, 3.2147], [16.7614, 0.6508, 3.2238]],
      [[16.8082, 0.4370, 3.3194], [19.8330, 0.4078, 3.3298], [16.8114, 0.3826, 3.1267], [19.9603, 0.3434, 3.1171]],
      [[16.8049, 0.1579, 3.7362], [19.8016, 0.1531, 3.7043], [16.8205, 0.3420, 3.6012], [19.7737, 0.3155, 3.5845]],
      [[18.8429, 0.3176, 3.5880], [19.7678, 0.3329, 3.5643], [18.8337, 0.4110, 3.3247], [19.8081, 0.4078, 3.3305]],
      [[19.5825, 0.1795, 2.8318], [20.2293, 0.1795, 2.8393], [19.5821, 0.2673, 2.5799], [20.9876, 0.3131, 2.5342]],
      [[19.5929, 0.2827, 2.5646], [20.9684, 0.3278, 2.5194], [19.5833, 0.3991, 2.2222], [20.9653, 0.4008, 2.2333]],
      [[19.5777, 0.3981, 2.2158], [20.9555, 0.4010, 2.2342], [19.5480, 0.2601, 1.9682], [20.9879, 0.2858, 1.9939]],
      [[20.6244, 0.2349, 1.9235], [21.0227, 0.2349, 1.9208], [20.6420, 0.2349, 1.8309], [21.0410, 0.2349, 1.8393]],
      [[20.6327, 0.1666, 1.8014], [21.0180, 0.1666, 1.8062], [20.6375, 0.1666, 1.6503], [21.0239, 0.1666, 1.6553]],
      [[20.7018, 0.2349, 1.5884], [21.0180, 0.2164, 1.5933], [20.6894, 0.2349, 1.4769], [21.0293, 0.2045, 1.4769]],
      [[23.9290, 0.4067, 2.2856], [25.0893, 0.4066, 2.2706], [23.9138, 0.2505, 1.9595], [25.0649, 0.2869, 1.9852]],
      [[24.2681, 0.2346, 1.9204], [25.0720, 0.2502, 1.9148], [24.5905, 0.1855, 1.6719], [25.0446, 0.1875, 1.6778]],
      [[23.9440, 0.3148, 2.5370], [25.0785, 0.3370, 2.5043], [23.9493, 0.4060, 2.2901], [25.0874, 0.4075, 2.2763]],
      [[23.9353, 0.2520, 2.6407], [25.0774, 0.2506, 2.6492], [23.9439, 0.3194, 2.5313], [25.0812, 0.3346, 2.5091]],
      [[23.9089, 0.2477, 2.7694], [25.0822, 0.2477, 2.7738], [23.9110, 0.2511, 2.6461], [25.0762, 0.2522, 2.6397]],
      [[24.9917, 0.2887, 3.1827], [25.0880, 0.2887, 3.1879], [24.9933, 0.2477, 2.7709], [25.0783, 0.2477, 2.7722]],
      [[24.1350, 0.2477, 3.1555], [24.2111, 0.2477, 3.1477], [23.9009, 0.2477, 2.7669], [24.0210, 0.2477, 2.7658]],
      [[24.5090, 0.2887, 3.8146], [25.0825, 0.2887, 3.8121], [24.1857, 0.2887, 3.2304], [25.0882, 0.2887, 3.2247]],
      [[16.5589, 0.9920, 2.5430], [16.6499, 0.9929, 2.5373], [16.5532, 0.9987, 2.0911], [16.6559, 0.9989, 2.0926]],
      [[7.5949, 0.6872, 2.5614], [9.1539, 0.6872, 2.5877], [7.6017, 0.6872, 2.4054], [9.3910, 0.6872, 2.4169]],
      [[4.2825, 0.3595, -0.2524], [4.8130, 0.3595, -0.1982], [4.2683, 0.3595, -0.3887], [4.8144, 0.3595, -0.4659]],
      [[2.7021, 0.7249, 0.8091], [2.4720, 0.9321, 1.5080], [9.8294, 0.7249, 1.2220], [9.8168, 0.7249, 1.7224]],
      [[10.0109, 0.7593, 1.2638], [9.9795, 0.7593, 2.4475], [10.1794, 0.7591, 1.2267], [10.1919, 0.7591, 2.4418]],
      [[-11.2747, 0.7176, 1.8572], [-5.1874, 0.6639, 1.8539], [-11.4078, 0.7176, 1.6302], [-5.1213, 0.7176, 1.7852]],
      [[-10.5485, 0.7176, -1.8732], [-6.4882, 0.7176, -0.4774], [-11.5196, 0.7176, -2.2495], [-10.9403, 0.7176, -2.3400]],
      [[9.8471, 0.5787, 4.3025], [9.9553, 0.5787, 4.1919], [9.7269, 0.5787, 4.1884], [9.8430, 0.5787, 4.0788]],
      [[6.4770, 0.7658, 2.6012], [6.7218, 0.7658, 2.5997], [6.4756, 0.7658, 2.4888], [6.7219, 0.7658, 2.4897]],
    ],
    keychainDefault: 52,
  },
}

/** Charm patterns run 0–100000 ($KeychainSeed = pattern / 100000). */
export const CHARM_PATTERN_MAX = 100000

/** One draw call's csgo_weapon material of a charm (charms.json, built by steam-tools/cs2-3d-pipeline/build_attachments.py). */
export interface CharmMaterial {
  vmat: string
  shader: string
  /** The vmat's values as written (numbers / "[x y z w]" vectors / 0–1 flags). */
  params: Record<string, string>
  /** Texture variable → path (asset root). */
  textures: Record<string, string>
  /** m_dynamicParams: variable → expression over $KeychainSeed (the charm's pattern). */
  dynamic?: Record<string, string>
}

export interface CharmDef {
  id: string
  name: string
  rarity?: string | null
  index: number
  /** The model exported by the CLI (meters, Y up). */
  model: string
  /** "<mesh>#<draw call>" → material. */
  materials: Record<string, CharmMaterial>
  /** Liquid charms: the `liquid_surface` bone the level is measured from (model space, inches, Z up). */
  liquidSurface?: [number, number, number]
}

/** A sticker in the picker's index: id, name, rarity, kind (paper / foil / holo / glitter). */
export interface StickerEntry { id: string; name: string; rarity: string | null; kind: string; index: number }

export interface AttachmentIndex {
  /** csgo_weapon_sticker's g_tStickerScratches (shared by every sticker). */
  scratches: string
  stickers: StickerEntry[]
  sticker: Map<string, StickerEntry>
  /** By sticker kit index (inspect links). */
  stickerByIndex: Map<number, StickerEntry>
  charms: CharmDef[]
  charm: Map<string, CharmDef>
  /** By keychain definition index (inspect links). */
  charmByIndex: Map<number, CharmDef>
}

const loaded = new Map<string, Promise<AttachmentIndex>>()

/** Every sticker (index only) and charm (in full); loaded once per asset root. */
export function loadAttachments(base: string): Promise<AttachmentIndex> {
  let p = loaded.get(base)
  if (!p) {
    p = (async () => {
      const [st, ch] = await Promise.all([
        fetch(base + 'extracted/viewer/stickers.json').then((r) => r.json()) as Promise<{ scratches: string; stickers: [string, string, string | null, string, number][] }>,
        fetch(base + 'extracted/viewer/charms.json').then((r) => r.json()) as Promise<{ charms: CharmDef[] }>,
      ])
      const stickers = st.stickers.map(([id, name, rarity, kind, index]) => ({ id, name, rarity, kind, index }))
      return {
        scratches: st.scratches, stickers, sticker: new Map(stickers.map((s) => [s.id, s])),
        stickerByIndex: new Map(stickers.map((s) => [s.index, s])),
        charms: ch.charms, charm: new Map(ch.charms.map((c) => [c.id, c])),
        charmByIndex: new Map(ch.charms.map((c) => [c.index, c])),
      }
    })()
    p.catch(() => loaded.delete(base))
    loaded.set(base, p)
  }
  return p
}

const stickerDefs = new Map<string, Promise<StickerDef>>()

/** A sticker's material (one file per sticker). */
export function loadStickerDef(base: string, id: string): Promise<StickerDef> {
  const key = base + id
  let p = stickerDefs.get(key)
  if (!p) {
    p = fetch(base + 'extracted/viewer/stickers/' + encodeURIComponent(id) + '.json').then((r) => {
      if (!r.ok) throw new Error('No sticker ' + id)
      return r.json() as Promise<StickerDef>
    })
    p.catch(() => stickerDefs.delete(key))
    stickerDefs.set(key, p)
  }
  return p
}

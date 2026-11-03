import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex } from '@/lib/data/catalog'
import type { ViewerState } from '@/hooks/use-viewer-state'
import { STICKER_MAX } from '@/lib/config'
import { selectionPath, skinKey, parseSkinKey, type Selection } from '@/lib/selection'
import { agentPatchesFromParam, agentPatchesToParam, PATCH_SLOTS, stickersToParam } from '@/lib/url-state'
import type { StickerOptions } from '@/lib/viewer/skin-viewer'

/**
 * Short share links: a view (what is shown, float, pattern, stickers, charm, first person) packed into a few bytes and
 * written in base64url, so a link reads `/share/AQcBnQKzD8Rk` instead of the full path and search params.
 *
 * The bytes use the game's own numbers (an item's definition index, a paint kit's index, a sticker kit's, a charm's
 * and an agent's definition index), which don't change between catalog builds, so old links keep working. Numbers
 * are varints; signed ones zigzag; decimals are stored scaled (float ×1e6, wear ×1e3, offsets ×1e4, degrees ×10).
 */

/** The indexes that turn the viewer's ids into the game's numbers and back. */
export interface ShareIndexes {
  catalog: CatalogIndex
  attachments: AttachmentIndex
  agents: AgentIndex
}

/** A link to the current view: short (`/share/<code>`) or, when the view can't be packed, the full one. */
export interface ShareLink {
  url: string
  short: boolean
}

/** What a share link holds: the selection and the view's state. */
export type ShareState = Pick<ViewerState, 'float' | 'seed' | 'firstPerson' | 'gloves' | 'agent' | 'stickers' | 'charm' | 'stickerWear' | 'agentPatches' | 'petVariant' | 'stickerCard'>

const VERSION = 1
const KINDS = ['skin', 'sticker', 'charm', 'agent', 'pin', 'patch', 'pet'] as const

// Skin flags: which optional parts follow.
const F_FLOAT = 1, F_SEED = 2, F_FIRST_PERSON = 4, F_GLOVES = 8, F_AGENT = 16, F_STICKERS = 32, F_CHARM = 64
// Sticker extras (with its slot in the low 3 bits).
const S_WEAR = 8, S_OFFSET = 16, S_ROTATION = 32, S_SCALE = 64
// Charm extras.
const C_SEED = 1, C_OFFSET = 2, C_POSITION = 4, C_STICKER = 8

class Writer {
  readonly bytes: number[] = []
  uint(n: number): this {
    let v = Math.max(0, Math.round(n))
    while (v >= 0x80) { this.bytes.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80) }
    this.bytes.push(v)
    return this
  }
  int(n: number): this {
    const v = Math.round(n)
    return this.uint(v < 0 ? -2 * v - 1 : 2 * v)
  }
}

class Reader {
  private i = 0
  constructor(private readonly bytes: Uint8Array) {}
  uint(): number {
    let v = 0, mul = 1
    for (;;) {
      if (this.i >= this.bytes.length) throw new Error('The link is cut short.')
      const b = this.bytes[this.i++]
      v += (b & 0x7f) * mul
      if (b < 0x80) return v
      mul *= 0x80
    }
  }
  int(): number {
    const v = this.uint()
    return v % 2 ? -(v + 1) / 2 : v / 2
  }
  /** Whether bytes are left (agent codes made before patches end after the agent). */
  more(): boolean {
    return this.i < this.bytes.length
  }
}

const toBase64Url = (bytes: number[]) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function fromBase64Url(code: string): Uint8Array {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** A skin key's game numbers (definition index, paint kit index), if the catalog has both. */
function skinNumbers(key: { item: string; kit: string }, catalog: CatalogIndex): [number, number] | null {
  const defindex = catalog.items[key.item]?.defindex
  const paint = catalog.skins.find((s) => s.item === key.item && s.kit === key.kit)?.paintIndex
  return defindex === undefined || paint === undefined ? null : [defindex, paint]
}

function skinFromNumbers(defindex: number, paint: number, catalog: CatalogIndex): { item: string; kit: string } {
  const item = Object.keys(catalog.items).find((key) => catalog.items[key].defindex === defindex)
  const skin = item ? catalog.skins.find((s) => s.item === item && s.paintIndex === paint) : undefined
  if (!skin) throw new Error(`This link names a skin the viewer doesn't have (item ${defindex}, paint kit ${paint}).`)
  return { item: skin.item, kit: skin.kit }
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`This link names ${what} the viewer doesn't have.`)
  return value
}

/**
 * Packs a view into a share code, or null when something in it has no game number (then share the full link).
 * @param selection what the stage shows
 * @param state the view's state
 * @param idx the catalog, sticker / charm and agent indexes
 */
export function encodeShare(selection: Selection, state: ShareState, idx: ShareIndexes): string | null {
  const w = new Writer()
  w.uint((VERSION << 3) | KINDS.indexOf(selection.kind))
  const stickerIndex = (id: string) => idx.attachments.sticker.get(id)?.index
  const charmIndex = (id: string) => idx.attachments.charm.get(id)?.index
  const agentIndex = (id: string) => idx.agents.agent.get(id)?.index

  if (selection.kind === 'sticker') {
    const index = stickerIndex(selection.id)
    if (index === undefined) return null
    w.uint(index).uint(state.stickerWear * 1e3)
    /** On its card: a flag after the wear (left out when off; older codes end there). */
    if (state.stickerCard) w.uint(1)
  } else if (selection.kind === 'charm') {
    const index = charmIndex(selection.id)
    const sticker = state.charm.sticker ? stickerIndex(state.charm.sticker) : -1
    if (index === undefined || sticker === undefined) return null
    w.uint(index).uint(state.charm.seed).uint(sticker + 1)
  } else if (selection.kind === 'pin' || selection.kind === 'patch') {
    /** A pin's or patch's id is its item / kit definition index. */
    w.uint(Number(selection.id))
  } else if (selection.kind === 'pet') {
    /** A pet's id is its definition number (the colour follows; the animation is left out). */
    w.uint(Number(selection.id)).uint(state.petVariant)
  } else if (selection.kind === 'agent') {
    const index = agentIndex(selection.id)
    if (index === undefined) return null
    w.uint(index)
    /** Its patches: a mask of the worn slots, then each one's kit id and size (thousandths). Left out when none. */
    const worn = state.agentPatches.map((p) => (p && Number.isInteger(Number(p.id)) ? p : null))
    const mask = worn.reduce((m, p, i) => m | (p ? 1 << i : 0), 0)
    if (mask) {
      w.uint(mask)
      for (const p of worn) if (p) w.uint(Number(p.id)).uint(p.scale * 1e3)
    }
  } else {
    const skin = skinNumbers(selection, idx.catalog)
    const gloves = state.gloves ? parseSkinKey(state.gloves) : null
    const glovesNumbers = gloves ? skinNumbers(gloves, idx.catalog) : null
    const agent = state.agent ? agentIndex(state.agent) : undefined
    const stickers = state.stickers.slice(0, STICKER_MAX)
    const stickerIndexes = stickers.map((s) => stickerIndex(s.id))
    const charm = state.charm.id ? charmIndex(state.charm.id) : undefined
    const charmSticker = state.charm.sticker ? stickerIndex(state.charm.sticker) : undefined
    if (!skin || (gloves && !glovesNumbers) || (state.agent && agent === undefined) || stickerIndexes.includes(undefined)
      || (state.charm.id && charm === undefined) || (state.charm.id && state.charm.sticker && charmSticker === undefined)) return null

    const first = state.firstPerson
    const flags = (state.float !== null ? F_FLOAT : 0) | (state.seed !== 1 ? F_SEED : 0) | (first ? F_FIRST_PERSON : 0)
      | (first && glovesNumbers ? F_GLOVES : 0) | (first && agent !== undefined ? F_AGENT : 0)
      | (stickers.length ? F_STICKERS : 0) | (charm !== undefined ? F_CHARM : 0)
    w.uint(skin[0]).uint(skin[1]).uint(flags)
    if (flags & F_FLOAT) w.uint(state.float! * 1e6)
    if (flags & F_SEED) w.uint(state.seed)
    if (flags & F_GLOVES) w.uint(glovesNumbers![0]).uint(glovesNumbers![1])
    if (flags & F_AGENT) w.uint(agent!)
    if (flags & F_STICKERS) {
      w.uint(stickers.length)
      stickers.forEach((s, k) => {
        const extras = (s.wear ? S_WEAR : 0) | (s.offset[0] || s.offset[1] ? S_OFFSET : 0) | (s.rotation ? S_ROTATION : 0) | ((s.scale ?? 1) !== 1 ? S_SCALE : 0)
        w.uint(stickerIndexes[k]!).uint((s.slot & 7) | extras)
        if (extras & S_WEAR) w.uint(s.wear * 1e3)
        if (extras & S_OFFSET) w.int(s.offset[0] * 1e4).int(s.offset[1] * 1e4)
        if (extras & S_ROTATION) w.int(s.rotation * 10)
        if (extras & S_SCALE) w.uint((s.scale ?? 1) * 1e3)
      })
    }
    if (flags & F_CHARM) {
      const c = state.charm
      const extras = (c.seed ? C_SEED : 0) | (c.offset[0] || c.offset[1] ? C_OFFSET : 0) | (c.position ? C_POSITION : 0) | (charmSticker !== undefined ? C_STICKER : 0)
      w.uint(charm!).uint(extras)
      if (extras & C_SEED) w.uint(c.seed)
      if (extras & C_OFFSET) w.int(c.offset[0] * 1e4).int(c.offset[1] * 1e4)
      if (extras & C_POSITION) c.position!.forEach((v) => w.int(v * 1e4))
      if (extras & C_STICKER) w.uint(charmSticker!)
    }
  }
  return toBase64Url(w.bytes)
}

/**
 * Unpacks a share code into the viewer's own link (path and search params).
 * @param code the code after /share/
 * @param idx the catalog, sticker / charm and agent indexes
 * @throws when the code is broken or names something the viewer doesn't have
 */
export function decodeShare(code: string, idx: ShareIndexes): string {
  let r: Reader
  try { r = new Reader(fromBase64Url(code)) } catch { throw new Error('This share link is broken.') }
  const head = r.uint()
  if (head >> 3 !== VERSION) throw new Error('This share link is broken or from another version of the viewer.')
  const kind = KINDS[head & 7]
  if (!kind) throw new Error('This share link is broken.')
  const sticker = (index: number) => need(idx.attachments.stickerByIndex.get(index), `a sticker (${index})`).id
  const charm = (index: number) => need(idx.attachments.charmByIndex.get(index), `a charm (${index})`).id
  const agent = (index: number) => need(idx.agents.agents.find((a) => a.index === index), `an agent (${index})`).id
  const params = new URLSearchParams()
  const link = (s: Selection) => selectionPath(s) + (params.size ? '?' + params : '')

  if (kind === 'sticker') {
    const id = sticker(r.uint())
    const wear = r.uint() / 1e3
    if (wear) params.set('swear', String(wear))
    if (r.more() && r.uint()) params.set('card', '1')
    return link({ kind, id })
  }
  if (kind === 'charm') {
    const id = charm(r.uint())
    const seed = r.uint(), slab = r.uint()
    if (seed) params.set('cseed', String(seed))
    if (slab) params.set('cst', sticker(slab - 1))
    return link({ kind, id })
  }
  if (kind === 'agent') {
    const id = agent(r.uint())
    if (r.more()) {
      const mask = r.uint()
      const worn = agentPatchesFromParam(null)
      for (let i = 0; i < PATCH_SLOTS; i++) if (mask & (1 << i)) worn[i] = { id: String(r.uint()), scale: r.uint() / 1e3 || 1 }
      const ap = agentPatchesToParam(worn)
      if (ap) params.set('ap', ap)
    }
    return link({ kind, id })
  }
  if (kind === 'pet') {
    const id = String(r.uint()), variant = r.uint()
    if (variant) params.set('pv', String(variant))
    return link({ kind, id })
  }
  if (kind === 'pin' || kind === 'patch') return link({ kind, id: String(r.uint()) })

  const skin = skinFromNumbers(r.uint(), r.uint(), idx.catalog)
  const flags = r.uint()
  if (flags & F_FLOAT) params.set('float', String(r.uint() / 1e6))
  if (flags & F_SEED) params.set('seed', String(r.uint()))
  if (flags & F_FIRST_PERSON) params.set('fp', '1')
  if (flags & F_GLOVES) params.set('fpg', skinKey(skinFromNumbers(r.uint(), r.uint(), idx.catalog)))
  if (flags & F_AGENT) params.set('fpa', agent(r.uint()))
  if (flags & F_STICKERS) {
    const count = Math.min(r.uint(), STICKER_MAX)
    const list: StickerOptions[] = []
    for (let k = 0; k < count; k++) {
      const id = sticker(r.uint())
      const extras = r.uint()
      list.push({
        id,
        slot: extras & 7,
        wear: extras & S_WEAR ? r.uint() / 1e3 : 0,
        offset: extras & S_OFFSET ? [r.int() / 1e4, r.int() / 1e4] : [0, 0],
        rotation: extras & S_ROTATION ? r.int() / 10 : 0,
        scale: extras & S_SCALE ? r.uint() / 1e3 : 1,
      })
    }
    params.set('st', stickersToParam(list))
  }
  if (flags & F_CHARM) {
    params.set('charm', charm(r.uint()))
    const extras = r.uint()
    if (extras & C_SEED) params.set('cseed', String(r.uint()))
    if (extras & C_OFFSET) { params.set('cx', String(r.int() / 1e4)); params.set('cz', String(r.int() / 1e4)) }
    if (extras & C_POSITION) for (const key of ['cpx', 'cpy', 'cpz']) params.set(key, String(r.int() / 1e4))
    if (extras & C_STICKER) params.set('cst', sticker(r.uint()))
  }
  return link({ kind: 'skin', ...skin })
}


/** Item definition indexes of the items that are a sticker or a charm themselves (not a weapon wearing one). */
export const STICKER_DEF_INDEX = 1209
export const KEYCHAIN_DEF_INDEX = 1355

/**
 * What an inspect link is of: a sticker (its kit in stickers[0]), a charm (in keychains[0]), an agent (its patches in
 * `stickers`) or a weapon / glove skin.
 */
export type InspectKind = 'sticker' | 'charm' | 'agent' | 'skin'

/**
 * @param link the decoded link
 * @param isAgent whether an item definition index is an agent's (agents have no fixed one)
 */
export function inspectKind(link: { defindex: number }, isAgent: (defindex: number) => boolean = () => false): InspectKind {
  if (link.defindex === STICKER_DEF_INDEX) return 'sticker'
  if (link.defindex === KEYCHAIN_DEF_INDEX) return 'charm'
  return isAgent(link.defindex) ? 'agent' : 'skin'
}

export interface InspectSticker {
  slot: number
  /** Sticker kit index (or keychain definition index for charms). */
  id: number
  wear?: number
  scale?: number
  rotation?: number
  offsetX?: number
  offsetY?: number
  offsetZ?: number
  /** Charms: the pattern. */
  pattern?: number
  /** Charms: the sticker kit inside a sticker slab. */
  wrappedSticker?: number
}

export interface InspectItem {
  defindex: number
  paintindex: number
  /** The float. */
  paintwear: number
  paintseed: number
  rarity?: number
  quality?: number
  customname?: string
  killeatervalue?: number
  stickers: InspectSticker[]
  keychains: InspectSticker[]
}

function varint(b: Uint8Array, i: number): [number, number] {
  let r = 0, mul = 1
  for (;;) {
    if (i >= b.length) throw new Error('Truncated data')
    const c = b[i++]
    r += (c & 0x7f) * mul
    mul *= 128
    if (c < 0x80) return [r, i]
  }
}

type Field = { field: number; wire: number; value: number | Uint8Array }

function fields(b: Uint8Array): Field[] {
  const out: Field[] = []
  let i = 0
  while (i < b.length) {
    const [tag, j] = varint(b, i)
    i = j
    const field = Math.floor(tag / 8), wire = tag & 7
    if (wire === 0) { const [v, k] = varint(b, i); i = k; out.push({ field, wire, value: v }) }
    else if (wire === 5) { out.push({ field, wire, value: b.slice(i, i + 4) }); i += 4 }
    else if (wire === 1) { out.push({ field, wire, value: b.slice(i, i + 8) }); i += 8 }
    else if (wire === 2) { const [n, k] = varint(b, i); i = k; out.push({ field, wire, value: b.slice(i, i + n) }); i += n }
    else throw new Error('Not an item (wire type ' + wire + ')')
  }
  return out
}

const f32 = (v: number | Uint8Array) => (v instanceof Uint8Array ? new DataView(v.buffer, v.byteOffset, 4).getFloat32(0, true) : v)
/** A uint32 holding a float's bits (paintwear). */
const bitsToFloat = (v: number) => { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, v >>> 0, true); return d.getFloat32(0, true) }

function sticker(b: Uint8Array): InspectSticker {
  const s: InspectSticker = { slot: 0, id: 0 }
  for (const { field, value } of fields(b)) {
    if (field === 1) s.slot = value as number
    else if (field === 2) s.id = value as number
    else if (field === 3) s.wear = f32(value)
    else if (field === 4) s.scale = f32(value)
    else if (field === 5) s.rotation = f32(value)
    else if (field === 7) s.offsetX = f32(value)
    else if (field === 8) s.offsetY = f32(value)
    else if (field === 9) s.offsetZ = f32(value)
    else if (field === 10) s.pattern = value as number
    else if (field === 12) s.wrappedSticker = value as number
  }
  return s
}

/** The hex payload of an inspect link (or the hex itself). */
export function inspectPayload(link: string): string {
  const text = decodeURIComponent(link.trim()).replace(/\s+/g, ' ')
  if (/[SM]\d+A\d+D\d+/.test(text)) {
    throw new Error('This is an old-style inspect link (S…A…D…): it only points at an item in an inventory. Its data comes from the game coordinator, which this viewer does not query. Use a link with the item data in it (csgo_econ_action_preview followed by a long hex string).')
  }
  const m = /csgo_econ_action_preview\s+([0-9A-Fa-f]+)/.exec(text) ?? /^([0-9A-Fa-f]{20,})$/.exec(text)
  if (!m) throw new Error('No item data in this link.')
  return m[1]
}

/**
 * Decodes an inspect link, or the bare hex in it. The hex is the masked form (a key byte, the protobuf XORed with it,
 * a 4-byte checksum); a raw protobuf hex (no key, no checksum) is accepted too.
 */
export function decodeInspectLink(link: string): InspectItem {
  const hex = inspectPayload(link)
  if (hex.length % 2) throw new Error('Odd-length hex data.')
  const raw = new Uint8Array(hex.length / 2)
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  try {
    const key = raw[0]
    return itemFromProto(raw.map((x) => x ^ key).subarray(1, raw.length - 4))
  } catch (masked) {
    try { return itemFromProto(raw) } catch { throw masked }
  }
}

/** The item in a protobuf CEconItemPreviewDataBlock. */
function itemFromProto(proto: Uint8Array): InspectItem {
  if (proto.length < 2) throw new Error('Too short.')
  const item: InspectItem = { defindex: 0, paintindex: 0, paintwear: 0, paintseed: 0, stickers: [], keychains: [] }
  for (const { field, value } of fields(proto)) {
    if (field === 3) item.defindex = value as number
    else if (field === 4) item.paintindex = value as number
    else if (field === 5) item.rarity = value as number
    else if (field === 6) item.quality = value as number
    else if (field === 7) item.paintwear = bitsToFloat(value as number)
    else if (field === 8) item.paintseed = value as number
    else if (field === 10) item.killeatervalue = value as number
    else if (field === 11) item.customname = new TextDecoder().decode(value as Uint8Array)
    else if (field === 12) item.stickers.push(sticker(value as Uint8Array))
    else if (field === 20) item.keychains.push(sticker(value as Uint8Array))
  }
  if (!item.defindex) throw new Error('No item in this link.')
  return item
}

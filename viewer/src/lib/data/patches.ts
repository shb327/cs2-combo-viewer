import { VIEWER_DATA } from '@/lib/data/catalog'

/** A patch kit (build_patches.py): its embroidered texture (under extracted/game) and where the game puts it on the card. */
export interface PatchEntry {
  id: string
  index: number
  name: string
  rarity: number | null
  texture: string
  /** The cloth behind the patch (shown where the agent's slot has a backing scale). */
  backing: string | null
  scale: number
  offset: [number, number]
  rotation: number
  squash: number
}

export interface PatchIndex {
  patches: PatchEntry[]
  /** The inspect card the patch sits on (the plastic package): color and normal textures. */
  card: { color: string; normal: string }
  patch: Map<string, PatchEntry>
}

const loaded = new Map<string, Promise<PatchIndex>>()

/** Every patch; loaded once per asset root. */
export function loadPatches(base: string): Promise<PatchIndex> {
  let p = loaded.get(base)
  if (!p) {
    p = fetch(base + VIEWER_DATA + 'patches.json')
      .then((r) => r.json() as Promise<{ patches: Omit<PatchEntry, 'id'>[]; card: PatchIndex['card'] }>)
      .then((d) => {
        const patches = d.patches.map((x) => ({ ...x, id: String(x.index) }))
        return { patches, card: d.card, patch: new Map(patches.map((x) => [x.id, x])) }
      })
    p.catch(() => loaded.delete(base))
    loaded.set(base, p)
  }
  return p
}

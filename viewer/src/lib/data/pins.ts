import type { DrawCall } from '@/lib/data/catalog'
import { VIEWER_DATA } from '@/lib/data/catalog'

/** A pin model (build_pins.py): its .glb path under extracted/game and its draw calls in order (the glitter overlay last or first). */
export interface PinModel {
  glb: string
  drawCalls: DrawCall[]
}

/** A collectible pin item: `index` is its item definition index (db.json's pins key). */
export interface PinEntry { id: string; index: number; name: string; model: string; rarity: number | null }

export interface PinIndex {
  pins: PinEntry[]
  models: Record<string, PinModel>
  pin: Map<string, PinEntry>
}

const loaded = new Map<string, Promise<PinIndex>>()

/** Every pin and pin model; loaded once per asset root. */
export function loadPins(base: string): Promise<PinIndex> {
  let p = loaded.get(base)
  if (!p) {
    p = fetch(base + VIEWER_DATA + 'pins.json')
      .then((r) => r.json() as Promise<{ pins: Omit<PinEntry, 'id'>[]; models: Record<string, PinModel> }>)
      .then((d) => {
        const pins = d.pins.map((x) => ({ ...x, id: String(x.index) }))
        return { pins, models: d.models, pin: new Map(pins.map((x) => [x.id, x])) }
      })
    p.catch(() => loaded.delete(base))
    loaded.set(base, p)
  }
  return p
}

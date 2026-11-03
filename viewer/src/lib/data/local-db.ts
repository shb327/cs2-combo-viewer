/**
 * A small local stand-in for the item database the viewer used to fetch: rarities and market names for the few items
 * the pipeline extracts so far. Later this comes from Combo Skin's catalog. No images: the picker shows its icons.
 *
 * Keys: weapons by item definition index, then paint index. Rarity: 1 Consumer … 6 Covert, 7 Contraband.
 */
export interface LocalDb {
  weapons: Record<string, { paints: Record<string, { rarity?: number }> }>
  agents: Record<string, { market_hash_name: string; rarity?: number }>
}

export const LOCAL_DB: LocalDb = {
  weapons: {
    /** Karambit: Doppler (Ruby), Doppler (Phase 2), Vanilla. */
    507: { paints: { 415: { rarity: 6 }, 419: { rarity: 6 }, 0: { rarity: 6 } } },
    /** Specialist Gloves: Crimson Kimono, Emerald Web. */
    5034: { paints: { 10033: { rarity: 6 }, 10034: { rarity: 6 } } },
  },
  agents: {},
}

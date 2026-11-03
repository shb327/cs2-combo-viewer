import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cachedJson } from '@/lib/cached-json'
import { DB_URL } from '@/lib/config'

/** How long a fetched db.json is reused before asking for it again. */
const DB_MAX_AGE = 3 * 60 * 60 * 1000

/** The parts of db.json (IDBSkins) the viewer reads: market names, images and in-game rarities. */
interface DbPaint { image?: string; rarity?: number }
interface DbData {
  weapons?: Record<string, { paints?: Record<string, DbPaint> }>
  stickers?: Record<string, { image?: string; image_akamaihd?: string; rarity?: number }>
  keychains?: Record<string, { image?: string; rarity?: number }>
  agents?: Record<string, { market_hash_name?: string; image?: string; rarity?: number }>
  pins?: Record<string, { market_hash_name?: string; image?: string; rarity?: number }>
  patches?: Record<string, { market_hash_name?: string; image?: string; rarity?: number }>
}

export interface DbImages {
  skin: (defindex: number | undefined, paintIndex: number | undefined) => string | undefined
  sticker: (index: number) => string | undefined
  charm: (index: number) => string | undefined
  /** The in-game rarity (1 Consumer … 7 Contraband) of each, when the db has it. */
  skinRarity: (defindex: number | undefined, paintIndex: number | undefined) => number | undefined
  stickerRarity: (index: number) => number | undefined
  charmRarity: (index: number) => number | undefined
  agent: (index: number) => string | undefined
  agentRarity: (index: number) => number | undefined
  /** An agent's market name ("Name | Faction"), by its item definition index; whether the db knows it. */
  agentName: (index: number) => string | undefined
  pin: (index: number) => string | undefined
  pinRarity: (index: number) => number | undefined
  /** A patch (an agent's "sticker", by its id): market name and image. */
  patchName: (id: number) => string | undefined
  patch: (id: number) => string | undefined
  patchRarity: (id: number) => number | undefined
}

const none = () => undefined
const EMPTY: DbImages = {
  skin: none, sticker: none, charm: none, skinRarity: none, stickerRarity: none, charmRarity: none,
  agent: none, agentRarity: none, agentName: none, pin: none, pinRarity: none, patchName: none, patch: none, patchRarity: none,
}

/** A usable rarity (1 Consumer … 7 Contraband), or undefined. */
const rarityNumber = (value: number | undefined) => (typeof value === 'number' && value > 0 ? value : undefined)
const DbContext = createContext<DbImages>(EMPTY)

const sized = (url: string | undefined) => (url && url.includes('/economy/image/') && !/\/\d+fx\d+f$/.test(url) ? `${url}/256fx192f` : url)


export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DbData | null>(null)
  useEffect(() => {
    let cancelled = false
    cachedJson<DbData>(DB_URL, DB_MAX_AGE)
      .then((data) => { if (!cancelled) setDb(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const images = useMemo<DbImages>(() => db ? {
    skin: (defindex, paintIndex) => defindex === undefined || paintIndex === undefined ? undefined : sized(db.weapons?.[defindex]?.paints?.[paintIndex]?.image),
    sticker: (index) => db.stickers?.[index]?.image_akamaihd ?? sized(db.stickers?.[index]?.image),
    charm: (index) => sized(db.keychains?.[index]?.image),
    skinRarity: (defindex, paintIndex) => defindex === undefined || paintIndex === undefined ? undefined : rarityNumber(db.weapons?.[defindex]?.paints?.[paintIndex]?.rarity),
    stickerRarity: (index) => rarityNumber(db.stickers?.[index]?.rarity),
    charmRarity: (index) => rarityNumber(db.keychains?.[index]?.rarity),
    agent: (index) => sized(db.agents?.[index]?.image),
    agentRarity: (index) => rarityNumber(db.agents?.[index]?.rarity),
    agentName: (index) => db.agents?.[index]?.market_hash_name,
    /** Pin images 404 with a size suffix: used as the db has them. */
    pin: (index) => db.pins?.[index]?.image,
    pinRarity: (index) => rarityNumber(db.pins?.[index]?.rarity),
    patchName: (id) => db.patches?.[id]?.market_hash_name,
    patch: (id) => sized(db.patches?.[id]?.image),
    patchRarity: (id) => rarityNumber(db.patches?.[id]?.rarity),
  } : EMPTY, [db])
  return <DbContext.Provider value={images}>{children}</DbContext.Provider>
}


export function useDbImages(): DbImages {
  return useContext(DbContext)
}

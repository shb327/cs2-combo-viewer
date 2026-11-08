import { DEFAULT_AGENT, type AgentIndex } from '@/lib/data/agents'
import { VANILLA, type CatalogIndex, type CatalogSkin } from '@/lib/data/catalog'

/**
 * The combo embed's contract (docs/embed.md): a knife and gloves by the game's item definition and paint indexes,
 * each with an exact float and pattern seed, on an agent's arms (by its item definition index).
 */
export const COMBO_VERSION = 1

export type ComboView = 'fp' | 'orbit'

/** A combo as the page sends it (URL parameters or `cs3d:load`). */
export interface ComboInput {
  knife?: number | string
  knife_paint?: number | string
  knife_float?: number | string
  knife_seed?: number | string
  gloves?: number | string
  gloves_paint?: number | string
  gloves_float?: number | string
  gloves_seed?: number | string
  /** Empty or left out: the default agent (Lt. Commander Ricksaw | NSWC SEAL). */
  agent?: number | string | null
}

export type ComboErrorCode =
  | 'no-webgl2' | 'bad-params' | 'unknown-knife' | 'unknown-knife-finish' | 'unknown-gloves' | 'unknown-gloves-finish'
  | 'unknown-agent' | 'assets-unavailable' | 'context-lost'

export interface ComboError { code: ComboErrorCode; message: string }

export interface ResolvedFinish { item: string; kit: string; float: number; seed: number }

/** A combo checked against the catalog: what the viewer loads. */
export interface ResolvedCombo {
  knife: ResolvedFinish
  gloves: ResolvedFinish
  /** The agent's item name (`customplayer_…`). */
  agent: string
  /** The combo as drawn, in the page's terms (indexes, the float and seed used), echoed in `cs3d:loaded`. */
  combo: NormalizedCombo
}

export interface NormalizedCombo {
  knife: number; knife_paint: number; knife_float: number; knife_seed: number
  gloves: number; gloves_paint: number; gloves_float: number; gloves_seed: number
  /** The agent's item definition index (the default's when none was given). */
  agent: number
}

export const COMBO_KEYS = ['knife', 'knife_paint', 'knife_float', 'knife_seed', 'gloves', 'gloves_paint', 'gloves_float', 'gloves_seed', 'agent'] as const

/** The pattern seeds the game uses. */
const SEED_RANGE = [0, 1000] as const
/** How far past a finish's float range a float may be and still be drawn (at the range's end): rounding on the page's side. */
const FLOAT_SLACK = 1e-4

/** The combo's fields from URL parameters (only those present). */
export function comboFromParams(params: URLSearchParams): ComboInput {
  const input: Record<string, string> = {}
  for (const key of COMBO_KEYS) {
    const v = params.get(key)
    if (v !== null) input[key] = v
  }
  return input
}

export function parseView(v: unknown): ComboView | null {
  if (v === undefined || v === null || v === '' || v === 'fp') return 'fp'
  return v === 'orbit' ? 'orbit' : null
}

const bad = (message: string): ComboError => ({ code: 'bad-params', message })

/** An integer field; undefined when absent or empty; an error when it isn't a whole number in range. */
function integer(input: ComboInput, key: keyof ComboInput, min: number, max: number): number | undefined | ComboError {
  const raw = input[key]
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : /^\s*-?\d+\s*$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(n) || n < min || n > max) return bad(`${key} must be a whole number from ${min} to ${max} (got "${raw}").`)
  return n
}

function decimal(input: ComboInput, key: keyof ComboInput): number | undefined | ComboError {
  const raw = input[key]
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : /^\s*\d*\.?\d+(e-?\d+)?\s*$/i.test(raw) ? Number(raw) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 1) return bad(`${key} must be a number from 0 to 1 (got "${raw}").`)
  return n
}

const isError = (v: unknown): v is ComboError => typeof v === 'object' && v !== null && 'code' in v

/**
 * Checks a combo against the catalog and the agents: every field present and in range, the items and finishes built.
 * @returns the combo to load, or the first problem found (an error the page can show)
 */
export function resolveCombo(input: ComboInput | null | undefined, catalog: CatalogIndex, agents: AgentIndex): ResolvedCombo | ComboError {
  if (!input || typeof input !== 'object') return bad('No combo given.')
  const fields = {
    knife: integer(input, 'knife', 0, 65535), knife_paint: integer(input, 'knife_paint', 0, 65535),
    knife_float: decimal(input, 'knife_float'), knife_seed: integer(input, 'knife_seed', ...SEED_RANGE),
    gloves: integer(input, 'gloves', 0, 65535), gloves_paint: integer(input, 'gloves_paint', 0, 65535),
    gloves_float: decimal(input, 'gloves_float'), gloves_seed: integer(input, 'gloves_seed', ...SEED_RANGE),
    agent: integer(input, 'agent', 0, 65535),
  }
  for (const v of Object.values(fields)) if (isError(v)) return v
  const f = fields as { [K in keyof typeof fields]: number | undefined }

  if (f.knife === undefined) return bad('knife (the knife\'s item definition index) is missing.')
  if (f.gloves === undefined) return bad('gloves (the gloves\' item definition index) is missing.')
  if (f.gloves_paint === undefined) return bad('gloves_paint (the glove finish\'s paint index) is missing.')

  const knifeItem = itemByDef(catalog, f.knife)
  if (!knifeItem || catalog.items[knifeItem].type !== 'Knife') {
    return { code: 'unknown-knife', message: knifeItem ? `Item ${f.knife} (${catalog.items[knifeItem].displayName}) isn't a knife.` : `Unknown knife (item ${f.knife}).` }
  }
  const glovesItem = itemByDef(catalog, f.gloves)
  if (!glovesItem || catalog.items[glovesItem].type !== 'Gloves') {
    return { code: 'unknown-gloves', message: glovesItem ? `Item ${f.gloves} (${catalog.items[glovesItem].displayName}) isn't a pair of gloves.` : `Unknown gloves (item ${f.gloves}).` }
  }

  const knifePaint = f.knife_paint ?? 0
  const knifeSkin = catalog.skins.find((s) => s.item === knifeItem && (s.paintIndex ?? 0) === knifePaint)
  if (!knifeSkin) return { code: 'unknown-knife-finish', message: `${catalog.items[knifeItem].displayName}: no finish with paint index ${knifePaint}.` }
  const gloveSkin = catalog.skins.find((s) => s.item === glovesItem && s.paintIndex === f.gloves_paint)
  if (!gloveSkin) return { code: 'unknown-gloves-finish', message: `${catalog.items[glovesItem].displayName}: no finish with paint index ${f.gloves_paint}.` }

  const vanilla = knifeSkin.kit === VANILLA
  if (!vanilla && f.knife_float === undefined) return bad('knife_float is missing.')
  if (!vanilla && f.knife_seed === undefined) return bad('knife_seed is missing.')
  if (f.gloves_float === undefined) return bad('gloves_float is missing.')
  if (f.gloves_seed === undefined) return bad('gloves_seed is missing.')
  const knifeFloat = vanilla ? f.knife_float ?? 0 : inRange(knifeSkin, f.knife_float!, 'knife_float', catalog)
  if (isError(knifeFloat)) return knifeFloat
  const gloveFloat = inRange(gloveSkin, f.gloves_float, 'gloves_float', catalog)
  if (isError(gloveFloat)) return gloveFloat

  let agentId = DEFAULT_AGENT
  if (f.agent !== undefined) {
    const agent = agents.agents.find((a) => a.index === f.agent)
    if (!agent) return { code: 'unknown-agent', message: `Unknown agent (item ${f.agent}).` }
    agentId = agent.id
  }
  const agentIndex = agents.agent.get(agentId)?.index ?? 0

  const knifeSeed = f.knife_seed ?? 0
  return {
    knife: { item: knifeItem, kit: knifeSkin.kit, float: knifeFloat, seed: knifeSeed },
    gloves: { item: glovesItem, kit: gloveSkin.kit, float: gloveFloat, seed: f.gloves_seed },
    agent: agentId,
    combo: {
      knife: f.knife, knife_paint: knifePaint, knife_float: knifeFloat, knife_seed: knifeSeed,
      gloves: f.gloves, gloves_paint: f.gloves_paint, gloves_float: gloveFloat, gloves_seed: f.gloves_seed,
      agent: agentIndex,
    },
  }
}

const itemByDef = (catalog: CatalogIndex, def: number): string | undefined =>
  Object.keys(catalog.items).find((key) => catalog.items[key].defindex === def)

/** The float, if it is in the finish's range (with a little slack for rounding, drawn at the range's end). */
function inRange(skin: CatalogSkin, float: number, key: string, catalog: CatalogIndex): number | ComboError {
  if (float < skin.floatMin - FLOAT_SLACK || float > skin.floatMax + FLOAT_SLACK) {
    return bad(`${key} ${float} is outside ${catalog.items[skin.item].displayName} | ${skin.name}'s range (${skin.floatMin} to ${skin.floatMax}).`)
  }
  return Math.min(skin.floatMax, Math.max(skin.floatMin, float))
}

/** A short key of what the viewer has to load (the same key: nothing to reload). */
export const comboKey = (c: ResolvedCombo): string =>
  [c.knife.item, c.knife.kit, c.knife.float, c.knife.seed, c.gloves.item, c.gloves.kit, c.gloves.float, c.gloves.seed, c.agent].join('|')

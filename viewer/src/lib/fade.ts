import type { KitRollPlan } from '@/lib/data/catalog'

/**
 * Fade percentages, as csgo-fade-percentage-calculator (https://github.com/chescos/csgo-fade-percentage-calculator, MIT,
 * by chescos) computes them and the market sites show them: the paint seed fixes the pattern's x offset and rotation
 * (Valve's own random stream), and the best of those values over the 1001 seeds is a 100% Fade, the worst an 80% one.
 * The ranges come from the kit's own vcompmat rolls (the same ones the viewer draws the seed with), so only which
 * weapons are Fades and which of them run the scale backwards — the calculator's lists — is kept here.
 */

const FADE_ITEMS = new Set([
  'weapon_awp', 'weapon_bayonet', 'weapon_knife_survival_bowie', 'weapon_knife_butterfly', 'weapon_knife_css', 'weapon_knife_falchion',
  'weapon_knife_flip', 'weapon_glock', 'weapon_knife_gut', 'weapon_knife_tactical', 'weapon_knife_karambit', 'weapon_knife_kukri',
  'weapon_m4a1_silencer', 'weapon_knife_m9_bayonet', 'weapon_mac10', 'weapon_mp7', 'weapon_knife_gypsy_jackknife', 'weapon_knife_outdoor',
  'weapon_knife_cord', 'weapon_revolver', 'weapon_knife_push', 'weapon_knife_skeleton', 'weapon_knife_stiletto', 'weapon_knife_canis',
  'weapon_knife_widowmaker', 'weapon_ump45', 'weapon_knife_ursus',
])
const AMBER_ITEMS = new Set(['weapon_aug', 'weapon_galilar', 'weapon_mac10', 'weapon_hkp2000', 'weapon_revolver', 'weapon_sawedoff'])
const ACID_ITEMS = new Set(['weapon_ssg08'])

/** The kits of each family (the viewer's catalog keys). */
const FADE_KITS = new Set(['aa_fade', 'aa_awp_fade', 'aa_fade_m4a1s', 'aa_fade_mp7', 'aa_fade_revolver', 'aa_fade_ump'])
const AMBER_KITS = new Set(['aa_fade_metallic', 'aa_fade_metallic_revolver'])
const ACID_KITS = new Set(['aa_fade_grassland'])

/** Weapons whose best seed has the lowest value instead of the highest. */
const REVERSED = new Set(['weapon_awp', 'weapon_knife_karambit', 'weapon_mp7', 'weapon_knife_widowmaker', 'weapon_ssg08'])

const MIN_PERCENTAGE = 80
const SEEDS = 1001

export interface FadeResult {
  /** 80 (worst) to 100 (best). */
  percentage: number
  /** 1 for the best and the worst seeds, up to about 500 for the middle (the calculator's ranking). */
  ranking: number
}

/** Whether a weapon with a paint kit is one of the Fades the calculator covers (gloves' Fade is not). */
export function isFade(weapon: string, kit: string): boolean {
  if (FADE_KITS.has(kit)) return FADE_ITEMS.has(weapon) && !(weapon === 'weapon_ump45' && kit === 'aa_fade_mp7')
  if (AMBER_KITS.has(kit)) return AMBER_ITEMS.has(weapon)
  if (ACID_KITS.has(kit)) return ACID_ITEMS.has(weapon)
  return false
}

/**
 * Valve's uniform random stream in double precision, as the calculator has it (ported from Step7750's UniformRandom). The
 * viewer's own stream (data/rng.ts) rounds like the game's float math; for a percentage the difference is a millionth,
 * but it would reorder seeds that tie, and with them the ranking.
 */
function uniform(seed: number): (low: number, high: number) => number {
  const NTAB = 32, IA = 16807, IM = 2147483647, IQ = 127773, IR = 2836
  const NDIV = 1 + (IM - 1) / NTAB, AM = 1 / IM, RNMX = 1 - 1.2e-7
  let idum = seed >= 0 ? -seed : seed
  let iy = 0
  const iv: number[] = []
  const next = (): number => {
    let k: number
    if (idum <= 0 || iy === 0) {
      idum = -idum < 1 ? 1 : -idum
      for (let j = NTAB + 7; j >= 0; j--) {
        k = Math.floor(idum / IQ)
        idum = Math.floor(IA * (idum - k * IQ) - IR * k)
        if (idum < 0) idum += IM
        if (j < NTAB) iv[j] = idum
      }
      iy = iv[0]
    }
    k = Math.floor(idum / IQ)
    idum = Math.floor(IA * (idum - k * IQ) - IR * k)
    if (idum < 0) idum += IM
    const j = Math.floor(iy / NDIV)
    iy = Math.floor(iv[j])
    iv[j] = idum
    return iy
  }
  return (low, high) => Math.min(AM * next(), RNMX) * (high - low) + low
}

const cache = new Map<string, { raw: number[]; worst: number; best: number; sorted: number[] }>()

/** The kit's per-seed values for a weapon (the x offset, the rotation, or both multiplied), best and worst of them. */
function table(weapon: string, kit: string, plan: KitRollPlan) {
  const key = `${weapon}|${kit}`
  let t = cache.get(key)
  if (t) return t
  /** A rolled variable's [low, high] for one component; a fixed one has the same value at both ends. */
  const bounds = (name: string, i: number): [number, number] => {
    const roll = plan.rolls.find((r) => r.var === name)
    if (roll?.min && !roll.fixed) return [roll.min[i] ?? 0, roll.max?.[i] ?? 0]
    const fixed = plan.fixed[name]?.[i] ?? 0
    return [fixed, fixed]
  }
  const [x0, x1] = bounds('g_vPatternTexCoordOffset', 0), [y0, y1] = bounds('g_vPatternTexCoordOffset', 1), [r0, r1] = bounds('g_flPatternTexCoordRotation', 0)
  const usesX = x0 !== x1, usesRotation = r0 !== r1
  const raw: number[] = []
  for (let seed = 0; seed < SEEDS; seed++) {
    const roll = uniform(seed)
    const xOffset = roll(x0, x1)
    roll(y0, y1)
    const rotation = roll(r0, r1)
    raw.push(usesRotation && usesX ? rotation * xOffset : usesRotation ? rotation : xOffset)
  }
  const high = Math.max(...raw), low = Math.min(...raw)
  const reversed = REVERSED.has(weapon)
  const best = reversed ? low : high, worst = reversed ? high : low
  const share = raw.map((r) => (worst - r) / (worst - best))
  t = { raw, best, worst, sorted: [...share].sort((a, b) => a - b) }
  cache.set(key, t)
  return t
}

/**
 * A Fade's percentage for a paint seed, or null when the weapon with this kit is not a Fade the calculator covers.
 * @param weapon the item's name (weapon_karambit…)
 * @param kit the paint kit's name (aa_fade…)
 * @param plan the kit's roll plan
 * @param seed 0–1000
 */
export function fadeOf(weapon: string, kit: string, plan: KitRollPlan | undefined, seed: number): FadeResult | null {
  if (!plan || !isFade(weapon, kit) || seed < 0 || seed >= SEEDS) return null
  const t = table(weapon, kit, plan)
  const share = (t.worst - t.raw[seed]) / (t.worst - t.best)
  const at = t.sorted.indexOf(share)
  return { percentage: MIN_PERCENTAGE + share * (100 - MIN_PERCENTAGE), ranking: Math.min(at + 1, t.sorted.length - at) }
}

/** The Fade percentage of a loaded skin at a paint seed, or null when it is not a Fade the calculator covers. */
export function fadeForItem(item: { id: string } & { rollPlan?: KitRollPlan }, seed: number): FadeResult | null {
  const [weapon, kit] = item.id.split('|')
  return weapon && kit ? fadeOf(weapon, kit, item.rollPlan, seed) : null
}

/** "93.1%": a Fade percentage as the stage shows it. */
export const fadeLabel = (fade: FadeResult): string => `${fade.percentage.toFixed(1)}%`

/** The Fade scale's colours, 80% to 100% (the CSS gradient of its meter, and the stops its number takes its colour from). */
const FADE_STOPS: [number, [number, number, number]][] = [
  [80, [255, 210, 63]], [87, [255, 138, 43]], [93, [255, 61, 127]], [100, [184, 77, 255]],
]
export const FADE_GRADIENT = `linear-gradient(90deg, ${FADE_STOPS.map(([, [r, g, b]], i) => `rgb(${r} ${g} ${b}) ${(i / (FADE_STOPS.length - 1)) * 100}%`).join(', ')})`

/** The colour of a Fade percentage: gold at 80%, through orange and pink, to purple at 100%. */
export function fadeColor(percentage: number): string {
  const p = Math.min(100, Math.max(80, percentage))
  const i = Math.max(0, FADE_STOPS.findIndex(([at]) => p <= at) - 1)
  const [a, from] = FADE_STOPS[i], [b, to] = FADE_STOPS[i + 1]
  const t = (p - a) / (b - a)
  const [r, g, bl] = from.map((c, k) => Math.round(c + (to[k] - c) * t))
  return `rgb(${r} ${g} ${bl})`
}

import type { KitRollPlan } from '@/lib/data/catalog'

/** Source's CUniformRandomStream (RandomSeed / RandomFloat): a float generator in [lo, hi). */
export type RandomFloat = (lo: number, hi: number) => number

export function valveRandom(seed: number): RandomFloat {
  const NTAB = 32, IA = 16807, IM = 2147483647, IQ = 127773, IR = 2836
  const NDIV = 1 + Math.trunc((IM - 1) / NTAB), AM = 1 / IM, RNMX = 1 - 1.2e-7
  let idum = seed < 0 ? seed : -seed
  let iy = 0
  const iv = new Array<number>(NTAB).fill(0)
  const next = () => {
    let k: number
    if (idum <= 0 || !iy) {
      idum = -idum < 1 ? 1 : -idum
      for (let j = NTAB + 7; j >= 0; j--) {
        k = Math.trunc(idum / IQ)
        idum = IA * (idum - k * IQ) - IR * k
        if (idum < 0) idum += IM
        if (j < NTAB) iv[j] = idum
      }
      iy = iv[0]
    }
    k = Math.trunc(idum / IQ)
    idum = IA * (idum - k * IQ) - IR * k
    if (idum < 0) idum += IM
    let j = Math.trunc(iy / NDIV)
    if (j >= NTAB || j < 0) j = (j % NTAB) & 0x7fffffff
    iy = iv[j]
    iv[j] = idum
    return iy
  }
  const f = Math.fround
  return (lo, hi) => f(f(Math.min(f(AM * next()), RNMX) * f(f(hi) - f(lo))) + f(lo))
}

/** A texture placement: scale, offset and rotation (degrees) around the UV center. */
export interface Placement { scale: number; offset: [number, number]; rot: number }

export interface SeedRolls {
  patternX: number
  patternY: number
  patternRot: number
  wear: Placement
  grunge: Placement
}

/**
 * The composite's rolls for a weapon seed, in the game's order (confirmed by an external viewer's
 * "randomRolls" data): pattern offset x, y, pattern rotation, then wear scale (1.6–1.8), offset x, y,
 * rotation, then grunge scale, offset x, y, rotation. Skins that fix a value (e.g. the Blaze's
 * offset x) still consume its roll.
 */
export function weaponRolls(seed: number): SeedRolls {
  const r = valveRandom(seed)
  const patternX = r(0, 1)
  const patternY = r(0, 1)
  const patternRot = r(0, 360)
  const wear: Placement = { scale: r(1.6, 1.8), offset: [r(0, 1), r(0, 1)], rot: r(0, 360) }
  const grunge: Placement = { scale: r(1.6, 1.8), offset: [r(0, 1), r(0, 1)], rot: r(0, 360) }
  return { patternX, patternY, patternRot, wear, grunge }
}

/**
 * A catalog kit's rolled variables (name → value per component): its vcompmat's rolled variables in order, one roll per component in [min, max)
 * (skinshotter's order is the same list: pattern offset, rotation, then wear and grunge). A variable
 * declared without bounds still consumes its rolls and keeps the kit's fixed value.
 */
export function kitRollValues(seed: number, plan: KitRollPlan): Record<string, number[]> {
  const r = valveRandom(seed)
  const v: Record<string, number[]> = {}
  for (const roll of plan.rolls) {
    const fixed = plan.fixed[roll.var] ?? [0]
    const n = roll.min?.length ?? (/^g_v/.test(roll.var) ? 2 : 1)
    v[roll.var] = Array.from({ length: n }, (_, i) => {
      const x = r(roll.min?.[i] ?? 0, roll.max?.[i] ?? 1)
      return roll.fixed || !roll.min ? fixed[i] ?? 0 : x
    })
  }
  return v
}

/** The same rolls as the placements the hand-ported styles use. */
export function kitRolls(seed: number, plan: KitRollPlan): SeedRolls {
  const v = kitRollValues(seed, plan)
  const get = (name: string, i: number, d: number) => v[name]?.[i] ?? plan.fixed[name]?.[i] ?? d
  const place = (kind: 'Wear' | 'Grunge'): Placement => ({
    scale: get(`g_fl${kind}TexCoordScale`, 0, 1.6),
    offset: [get(`g_v${kind}TexCoordOffset`, 0, 0), get(`g_v${kind}TexCoordOffset`, 1, 0)],
    rot: get(`g_fl${kind}TexCoordRotation`, 0, 0),
  })
  return {
    patternX: get('g_vPatternTexCoordOffset', 0, 0), patternY: get('g_vPatternTexCoordOffset', 1, 0),
    patternRot: get('g_flPatternTexCoordRotation', 0, 0),
    wear: place('Wear'), grunge: place('Grunge'),
  }
}

/** A classic glove hand's placement: pattern offset and rotation, grunge offset and rotation (degrees). */
export interface ClassicGloveRolls { pattern: [number, number]; patternRot: number; grunge: [number, number]; grungeRot: number }

/** The four variables a classic glove kit rolls, in its vcompmat's order, with the bounds a kit inherits. */
const CLASSIC_GLOVE_ROLLS: [string, number[], number[]][] = [
  ['g_fPatternTexCoordOffset', [0, 0], [1, 1]],
  ['g_fPatternTexCoordRotation', [0], [360]],
  ['g_fGrungeTexCoordOffset', [0, 0], [1, 1]],
  ['g_fGrungeTexCoordRotation', [0], [360]],
]

/**
 * A classic glove's rolls from one hand's stream (gloves/paints/_shared_paint_generic.vcompmat): each variable's
 * components in order, inside the kit's own bounds (its instance_params: Marble Fade fixes the pattern's x at 0.65,
 * Fade turns it 45° to 135°, Crimson Kimono fixes it at 25.2°), else the shared ones. A kit lists its rolls twice,
 * once per seed; a hand rolls one set, so the first is read. A variable without bounds keeps the kit's value and
 * still uses up its draws, as with the weapons (kitRollValues).
 */
export function classicGloveRolls(r: RandomFloat, plan?: KitRollPlan): ClassicGloveRolls {
  const [pattern, patternRot, grunge, grungeRot] = CLASSIC_GLOVE_ROLLS.map(([name, min, max]) => {
    const roll = plan?.rolls.find((x) => x.var === name)
    const keep = !!roll && (roll.fixed || !roll.min)
    return min.map((_, i) => {
      const x = r(roll?.min?.[i] ?? min[i], roll?.max?.[i] ?? max[i])
      return keep ? plan!.fixed[name]?.[i] ?? 0 : x
    })
  })
  return { pattern: [pattern[0], pattern[1]], patternRot: patternRot[0], grunge: [grunge[0], grunge[1]], grungeRot: grungeRot[0] }
}

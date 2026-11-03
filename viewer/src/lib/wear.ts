import type { Item } from '@/lib/data/items'

export const WEARS = [
  { max: 0.07, name: 'Factory New', short: 'FN', color: '#34d399' },
  { max: 0.15, name: 'Minimal Wear', short: 'MW', color: '#a3e635' },
  { max: 0.38, name: 'Field-Tested', short: 'FT', color: '#facc15' },
  { max: 0.45, name: 'Well-Worn', short: 'WW', color: '#fb923c' },
  { max: 1.01, name: 'Battle-Scarred', short: 'BS', color: '#f87171' },
] as const

export type Wear = (typeof WEARS)[number]
export const wearOf = (f: number): Wear => WEARS.find((w) => f < w.max) ?? WEARS[WEARS.length - 1]

export const STYLE_LABEL: Record<Item['style'], string> = {
  custom: 'Custom paint', airbrush: 'Anodized airbrush', multi: 'Anodized multicolor', glove: 'Gloves', bare: 'Not ported yet', composite: 'Game composite',
  solid: 'Solid color', hydro: 'Hydrographic', spray: 'Spray-paint', anodized: 'Anodized', patina: 'Patina', gunsmith: 'Gunsmith',
}

export const clampFloat = (item: Item, f: number) => Math.min(item.floatMax, Math.max(item.floatMin, f))
/** Pattern seeds run 1–1000 (there is no seed 0). */
export const clampSeed = (s: number) => Math.max(1, Math.min(1000, Math.round(s) || 1))

/** One preset per wear present in the item's range (at a representative float), plus its maximum. */
export function presetsFor(item: Item): { label: string; f: number }[] {
  const reps = [0.03, 0.1, 0.25, 0.41, 0.6]
  const out: { label: string; f: number }[] = []
  WEARS.forEach((w, i) => {
    const lo = i === 0 ? 0 : WEARS[i - 1].max
    if (item.floatMax > lo && item.floatMin < w.max) out.push({ label: w.short, f: +clampFloat(item, reps[i]).toFixed(4) })
  })
  return out
}

/** CSS gradient of the wear bands across the item's float range. */
export function bandsGradient(item: Item): string {
  const span = item.floatMax - item.floatMin || 1
  const pct = (f: number) => ((clampFloat(item, f) - item.floatMin) / span) * 100
  const stops: string[] = []
  let from = item.floatMin
  for (const w of WEARS) {
    const to = Math.min(w.max, item.floatMax)
    if (to > from) stops.push(`${w.color} ${pct(from)}%`, `${w.color} ${pct(to)}%`)
    from = Math.max(from, w.max)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

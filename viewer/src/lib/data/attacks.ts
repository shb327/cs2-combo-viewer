/** One of a weapon's attack animations (build_firstperson.py `attacks`): the clip's name and its file under firstperson/attack. */
export interface AttackEntry {
  name: string
  file: string
}

/** An attack the viewer offers: its clip name and its label. */
export interface AttackInfo {
  name: string
  label: string
}

const LABELS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^shoot_empty$|^dryfire$/, () => 'Dry fire'],
  [/^shoot_alt(\d*)$/, () => 'Alt fire'],
  [/^shoot_left(last|\d+)$/, (m) => (m[1] === 'last' ? 'Fire left (last)' : 'Fire left')],
  [/^shoot_right(last|\d+)$/, (m) => (m[1] === 'last' ? 'Fire right (last)' : 'Fire right')],
  [/^shoot\d*$/, () => 'Fire'],
  [/^light_hit(\d*)$/, (m) => `Slash ${m[1] || 1}`],
  [/^light_miss(\d*)$/, (m) => `Slash miss ${m[1] || 1}`],
  [/^light_backstab(\d*)$/, (m) => (m[1] && m[1] !== '1' ? `Backstab slash ${m[1]}` : 'Backstab slash')],
  [/^heavy_hit(\d*)$/, () => 'Stab'],
  [/^heavy_miss(\d*)$/, () => 'Stab miss'],
  [/^heavy_backstab(\d*)$/, () => 'Backstab stab'],
]

/** A clip name's label for the UI. */
export function attackLabel(name: string): string {
  for (const [re, label] of LABELS) {
    const m = re.exec(name)
    if (m) return label(m)
  }
  return name
}

/** The order the attacks are listed in: shots (primary first, dry fire last), then a knife's slashes, stabs and backstabs. */
const ORDER = [/^shoot\d*$/, /^shoot_alt/, /^shoot_left\d/, /^shoot_leftlast/, /^shoot_right\d/, /^shoot_rightlast/, /^shoot_empty$|^dryfire$/,
  /^light_hit/, /^light_miss/, /^heavy_hit/, /^heavy_miss/, /^light_backstab/, /^heavy_backstab/]

export function sortAttacks(list: AttackEntry[]): AttackEntry[] {
  const rank = (n: string) => {
    const i = ORDER.findIndex((re) => re.test(n))
    return i < 0 ? ORDER.length : i
  }
  return [...list].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}

/** The attack a plain "fire" key plays: a gun's shot; a knife's slashes, one after the other. */
export function primaryAttacks(list: AttackEntry[]): AttackEntry[] {
  const shots = list.filter((a) => /^shoot\d*$/.test(a.name))
  if (shots.length) return shots.slice(0, 1)
  /** Dual Berettas: left, right, left… */
  const sides = ['shoot_left1', 'shoot_right1'].map((n) => list.find((a) => a.name === n)).filter((a): a is AttackEntry => !!a)
  if (sides.length === 2) return sides
  const slashes = list.filter((a) => /^light_hit\d*$/.test(a.name))
  return slashes.length ? slashes : list.slice(0, 1)
}

/** The secondary attack (right click): a gun's alternate fire, else a knife's stab, else the plain fire. */
export function secondaryAttack(list: AttackEntry[]): AttackEntry | undefined {
  return list.find((a) => /^shoot_alt/.test(a.name)) ?? list.find((a) => /^heavy_hit/.test(a.name))
}

/**
 * The automatic weapons and their cycle time (seconds between shots): holding fire repeats the shot at this rate. CS2's own table is
 * scripts/weapons.vdata (IsFullAuto, CycleTime), which the Source2Viewer CLI can't decode (KV3 type 0x1A): these are CS2's published values.
 */
export const AUTO_CYCLE: Record<string, number> = {
  weapon_ak47: 0.1, weapon_m4a1: 0.0909, weapon_m4a1_silencer: 0.0909, weapon_aug: 0.0909, weapon_sg556: 0.0909, weapon_famas: 0.09,
  weapon_galilar: 0.09, weapon_mac10: 0.075, weapon_mp9: 0.07, weapon_mp7: 0.08, weapon_mp5sd: 0.0769, weapon_ump45: 0.0909, weapon_p90: 0.07,
  weapon_bizon: 0.08, weapon_m249: 0.08, weapon_negev: 0.0592, weapon_cz75a: 0.1,
}

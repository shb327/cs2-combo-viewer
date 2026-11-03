/** The game's names for the tricks the photo booth offers (PetPhotoTag.ACTIVITIES: activity "trick" + variation, and csgo_english). */
const TRICKS: Record<number, string> = { 1: 'Fly', 2: 'Sit', 5: 'Dance', 9: 'Wag', 11: 'Jump', 12: 'Kick' }

/** The photo booth's poses (pet_photo_booth_pose_N); the snapshot clips come numbered 01–10, one per pose. */
const POSES: Record<number, string> = { 1: 'Shoulder', 2: 'Take the knee', 3: 'Hawk', 4: 'Gaze', 5: 'Big hug', 6: 'Overhead', 7: 'Head', 8: 'Bird in hand', 9: 'Finger', 10: 'Protect' }

const num = (s: string) => String(Number(s))

/** The folder titles the pet panel groups its clips under; the order they are listed in. */
export const CLIP_CATEGORIES = ['Idle and reactions', 'Tricks', 'Movement', 'Turns', 'Menu', 'Photo poses', 'Egg'] as const
export type ClipCategory = (typeof CLIP_CATEGORIES)[number]

/**
 * The category of a pet clip, from its folder (menu, snapshot, egg) and, for the world ones, its file name.
 * @param group the clip's folder in the VPK
 * @param name the clip's file name without extension
 */
export function petClipCategory(group: string, name: string): ClipCategory {
  if (group === 'snapshot') return 'Photo poses'
  if (group === 'ui') return 'Menu'
  if (group === 'egg') return 'Egg'
  const n = name.replace(/^chick(baby)?_/, '')
  if (/^\d/.test(n)) return 'Turns'
  if (/^(idle|react|scared)/.test(n)) return 'Idle and reactions'
  if (/^trick/.test(n)) return 'Tricks'
  return 'Movement'
}

/**
 * A readable name for a pet clip (`chick_trick05` → "Dance"). The tricks and poses carry the game's own names; the rest
 * is described from the clip's file name (a turn in place by its angle, idle / react / scared by their number…).
 * @param name the clip's file name without extension
 */
export function petClipLabel(name: string): string {
  const baby = name.startsWith('chickbaby_')
  let n = name.replace(/^chick(baby)?_/, '')
  const done = (label: string) => (baby ? `${label} (chick)` : label)

  let m = /^snapshots_(\d+)(?:_(adolescent|baby))?$/.exec(n)
  if (m) return `${POSES[Number(m[1])] ?? 'Pose ' + num(m[1])}${m[2] === 'adolescent' ? ' (pullet)' : m[2] === 'baby' ? ' (chick)' : ''}`
  m = /^trick(\d+)$/.exec(n)
  if (m) return TRICKS[Number(m[1])] ?? `Trick ${num(m[1])}`
  m = /^(\d+)([lr]{0,2})$/.exec(n)
  if (m) return m[2] === 'lr' ? `Turn ${num(m[1])}° (blend)` : `Turn ${num(m[1])}°${m[2] === 'l' ? ' left' : m[2] === 'r' ? ' right' : ''}`
  m = /^(idle|react|scared)(\d+)(alt)?(_water)?$/.exec(n)
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${num(m[2])}${m[3] ? ' alt' : ''}${m[4] ? ' (water)' : ''}`
  m = /^egg_idle_phase(\d+)(_still)?$/.exec(n)
  if (m) return `Idle, phase ${num(m[1])}${m[2] ? ' (still)' : ''}`
  m = /^egg_reaction(\d+)$/.exec(n)
  if (m) return `Reaction ${num(m[1])}`
  m = /^egg_hatch(\d+)(alt)?(_loop)?$/.exec(n)
  if (m) return done(`Hatching ${num(m[1])}${m[2] ? ' alt' : ''}${m[3] ? ' (loop)' : ''}`)
  m = /^shoulder_(\d+)$/.exec(n)
  if (m) return `On the shoulder ${num(m[1])}`
  m = /^(feed|feed_to_sad|retirement|reveal)(\d*)(_baby)?(_loop)?$/.exec(n)
  if (m) {
    const title = { feed: 'Eating', feed_to_sad: 'Hungry', retirement: 'Retirement', reveal: 'Reveal' }[m[1]]
    return done(`${title}${m[2] ? ' ' + num(m[2]) : ''}${m[3] ? ' (chick)' : ''}${m[4] ? ' (loop)' : ''}`)
  }
  m = /^squat_loop(\d+)$/.exec(n)
  if (m) return `Squat ${num(m[1])}`
  m = /^sleep_flinch(\d+)$/.exec(n)
  if (m) return `Sleep, flinch ${num(m[1])}`

  const fixed: Record<string, string> = {
    walk: 'Walk', walk_swim: 'Walk (swim)', start_walk: 'Start walking', run: 'Run', run_swim: 'Run (swim)', runflap: 'Run (flapping)',
    hop: 'Hop', land: 'Land', land_water: 'Land (water)', fall_flap: 'Fall (flapping)', sleep_loop01: 'Sleep', squat_start: 'Squat down', squat_stand: 'Stand up',
  }
  if (fixed[n]) return fixed[n]
  n = n.replace(/_/g, ' ')
  return n.charAt(0).toUpperCase() + n.slice(1)
}

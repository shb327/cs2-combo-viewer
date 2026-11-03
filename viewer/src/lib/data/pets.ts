import type { DrawCall } from '@/lib/data/catalog'
import { VIEWER_DATA } from '@/lib/data/catalog'
import type { ArmsSkeleton, InspectClip } from '@/lib/viewer/firstperson'

/** One colour of a pet model (build_pets.py): the draw calls' materials in mesh order; `groups` are the model's material groups that use it. */
export interface PetVariant { name: string; groups: string[]; drawCalls: DrawCall[] }

/** A pet model: its .glb path under extracted/game, its own skeleton (the glb's joints index it) and its colours. */
export interface PetModel { glb: string; skeleton: ArmsSkeleton; variants: PetVariant[] }

/** A pet of the game's `pet_definitions` (the egg, the chick, the three breeds) or its roasted chicken. */
export interface PetEntry { id: string; name: string; key: string; model: string }

/** An animation clip of the pets (animation/anims/chicken, animation/anims/egg): which skeleton it plays on and its length. */
export interface PetClip { name: string; group: string; file: string; skeleton: string; duration: number; frames: number }

export interface PetIndex {
  pets: PetEntry[]
  models: Record<string, PetModel>
  pet: Map<string, PetEntry>
  skeletons: Record<string, { bones: string[]; parents: number[] }>
  clips: PetClip[]
}

const loaded = new Map<string, Promise<PetIndex>>()

/** Every pet, model and animation; loaded once per asset root. */
export function loadPets(base: string): Promise<PetIndex> {
  let p = loaded.get(base)
  if (!p) {
    const get = <T>(file: string) => fetch(base + VIEWER_DATA + file).then((r) => r.json() as Promise<T>)
    p = Promise.all([
      get<{ pets: (Omit<PetEntry, 'id'> & { id: number })[]; models: Record<string, PetModel> }>('pets.json'),
      get<{ skeletons: PetIndex['skeletons']; clips: PetClip[] }>('pets/anim_index.json').catch(() => ({ skeletons: {}, clips: [] as PetClip[] })),
    ]).then(([d, a]) => {
      const pets = d.pets.map((x) => ({ ...x, id: String(x.id) }))
      return { pets, models: d.models, pet: new Map(pets.map((x) => [x.id, x])), skeletons: a.skeletons, clips: a.clips }
    })
    p.catch(() => loaded.delete(base))
    loaded.set(base, p)
  }
  return p
}

/** The clips that play on a pet's model: those of a skeleton that has all the model's bones (the roasted chicken has none). */
export function petClips(index: PetIndex, entry: PetEntry): PetClip[] {
  const bones = index.models[entry.model]?.skeleton.bones ?? []
  const fits = new Map<string, boolean>()
  return index.clips.filter((c) => {
    if (!fits.has(c.skeleton)) {
      const have = new Set(index.skeletons[c.skeleton]?.bones)
      fits.set(c.skeleton, bones.length > 0 && bones.every((b) => have.has(b)))
    }
    return fits.get(c.skeleton)
  })
}

const clipCache = new Map<string, Promise<InspectClip>>()

/**
 * A clip's tracks as an inspect clip (what `samplePose` plays). The root motion bone stays in place: the clip's own
 * walk would carry the pet off the stage and back at every loop.
 */
export function loadPetClip(base: string, index: PetIndex, clip: PetClip): Promise<InspectClip> {
  const key = base + clip.file
  let p = clipCache.get(key)
  if (!p) {
    const skeleton = index.skeletons[clip.skeleton]
    p = fetch(base + VIEWER_DATA + 'pets/anim/' + clip.file)
      .then((r) => r.json() as Promise<{ duration: number; frames: number; tracks: [number[], number[]][] }>)
      .then((d) => ({
        clip: clip.name,
        duration: d.duration,
        frames: d.frames,
        viewmodel: {
          bones: skeleton.bones,
          parents: skeleton.parents,
          tracks: d.tracks.map(([t, q], i) => (/_rm$|^root_motion$/.test(skeleton.bones[i]) ? [[0, 0, 0], q] : [t, q])) as [number[], number[]][],
        },
      }))
    p.catch(() => clipCache.delete(key))
    clipCache.set(key, p)
  }
  return p
}

/** The clip a pet starts in: its first idle (else its first clip). */
export function defaultPetClip(clips: PetClip[]): PetClip | undefined {
  return clips.find((c) => /idle01(_still)?$/.test(c.name)) ?? clips.find((c) => /idle/.test(c.name)) ?? clips[0]
}

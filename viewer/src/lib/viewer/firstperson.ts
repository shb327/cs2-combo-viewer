import * as THREE from 'three'
import { fitAffine } from '@/lib/viewer/geometry'

/** A viewmodel idle pose (build_firstperson.py): bones' parent-space (translation, rotation xyzw, scale), Source units. */
export interface BonePose { bones: string[]; parents: number[]; pose: [number[], number[], number][] }
export interface ViewmodelPose { clip: string; viewmodel: BonePose; weapon?: BonePose & { skeleton: string } }
/** The arm / glove models' skeleton: bind pose in the parent's space (Source units). */
export interface ArmsSkeleton { bones: string[]; parents: number[]; pos: number[][]; rot: number[][]; twists?: TwistConstraint[] }
/** A twist bone taking `weight` × its target's roll about `targetAxis`, around its own `axis` (0 x, 1 y, 2 z). */
export interface TwistConstraint { bone: string; target: string; weight: number; targetAxis: number; axis: number }


/** Source (x forward, y left, z up, inches) → glTF as the exported models have it: (y, z, x) × 0.0254. */
const K = 0.0254
const CM = new THREE.Matrix4().set(0, K, 0, 0, 0, 0, K, 0, K, 0, 0, 0, 0, 0, 0, 1)
const CM_INV = CM.clone().invert()
/** A Source-space transform expressed in the glTF space. */
const toGltf = (m: THREE.Matrix4) => CM.clone().multiply(m).multiply(CM_INV)

const local = (t: number[], q: number[]) => new THREE.Matrix4().compose(new THREE.Vector3(...t), new THREE.Quaternion(...q), new THREE.Vector3(1, 1, 1))

function worlds(pose: BonePose): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = []
  pose.pose.forEach(([t, q], i) => {
    const m = local(t, q)
    out.push(pose.parents[i] < 0 ? m : out[pose.parents[i]].clone().multiply(m))
  })
  return out
}

/**
 * Moves the weights an agent's first-person mesh puts on torso bones onto the upper arm of the vertex's side. The
 * viewmodel skeleton has only the arms (from the upper arm down): some sleeves (Jungle Raider's) also weigh the shoulder
 * end to spine / clavicle / scapula / pouch jiggles, which would stay at the agent's standing pose, hanging off the
 * viewmodel's root (the eye), and stretch the sleeve across the view. The side is the vertex's own arm weights', else
 * the nearer upper arm in the bind pose.
 */
export function anchorTorsoToArms(g: THREE.BufferGeometry, skeleton: ArmsSkeleton): void {
  const idx = g.getAttribute('skinIndex'), wt = g.getAttribute('skinWeight'), position = g.getAttribute('position')
  const upper = [skeleton.bones.indexOf('arm_upper_L'), skeleton.bones.indexOf('arm_upper_R')]
  if (!idx || !wt || upper.some((i) => i < 0)) return
  /** Each bone's arm (0 left, 1 right), or -1 for the torso: whether an upper arm is the bone or one of its ancestors. */
  const side = skeleton.bones.map((_, i) => {
    for (let b = i; b >= 0; b = skeleton.parents[b]) {
      const s = upper.indexOf(b)
      if (s >= 0) return s
    }
    return -1
  })
  if (!side.includes(-1)) return
  const bind: THREE.Matrix4[] = []
  skeleton.bones.forEach((_, i) => {
    const m = local(skeleton.pos[i], skeleton.rot[i])
    bind.push(skeleton.parents[i] < 0 ? m : bind[skeleton.parents[i]].clone().multiply(m))
  })
  const shoulders = upper.map((i) => new THREE.Vector3().setFromMatrixPosition(toGltf(bind[i])))
  const p = new THREE.Vector3()
  for (let v = 0; v < idx.count; v++) {
    const arm = [0, 0]
    for (let k = 0; k < 4; k++) {
      const s = side[idx.getComponent(v, k)]
      if (s >= 0) arm[s] += wt.getComponent(v, k)
    }
    let s = arm[0] === arm[1] ? -1 : arm[0] > arm[1] ? 0 : 1
    for (let k = 0; k < 4; k++) {
      if (wt.getComponent(v, k) === 0 || side[idx.getComponent(v, k)] >= 0) continue
      if (s < 0) {
        p.fromBufferAttribute(position, v)
        s = p.distanceToSquared(shoulders[0]) <= p.distanceToSquared(shoulders[1]) ? 0 : 1
      }
      idx.setComponent(v, k, upper[s])
    }
  }
  idx.needsUpdate = true
}

/**
 * A part's skeleton (the skin gloves' arms.json) completed with the ancestors it lacks from the agent's: its root bones
 * (arm_upper_L/R there) are re-parented under the agent's chain (clavicle → spine → …) with the same bind. The twist
 * constraints measure a target's roll against its parent; with arm_upper as a root that was the whole body's turn, so
 * the gloves' upper arm rolled apart from the agent's sleeve. Joint indices are kept (the ancestors are appended).
 */
export function adoptAncestors(part: ArmsSkeleton, full: ArmsSkeleton): ArmsSkeleton {
  const out: ArmsSkeleton = { ...part, bones: [...part.bones], parents: [...part.parents], pos: part.pos.map((p) => [...p]), rot: part.rot.map((r) => [...r]) }
  const fullIndex = new Map(full.bones.map((n, i) => [n, i]))
  const fullWorld: THREE.Matrix4[] = []
  full.bones.forEach((_, i) => {
    const m = local(full.pos[i], full.rot[i])
    fullWorld.push(full.parents[i] < 0 ? m : fullWorld[full.parents[i]].clone().multiply(m))
  })
  const partWorld: THREE.Matrix4[] = []
  part.bones.forEach((_, i) => {
    const m = local(part.pos[i], part.rot[i])
    partWorld.push(part.parents[i] < 0 ? m : partWorld[part.parents[i]].clone().multiply(m))
  })
  /** The part's index of a full-skeleton bone, appending it (and its ancestors) when missing. */
  const adopt = (fi: number): number => {
    const name = full.bones[fi]
    const have = out.bones.indexOf(name)
    if (have >= 0) return have
    const parent = full.parents[fi] < 0 ? -1 : adopt(full.parents[fi])
    out.bones.push(name)
    out.parents.push(parent)
    out.pos.push([...full.pos[fi]])
    out.rot.push([...full.rot[fi]])
    return out.bones.length - 1
  }
  part.bones.forEach((name, i) => {
    const fi = fullIndex.get(name)
    if (part.parents[i] >= 0 || fi === undefined || full.parents[fi] < 0) return
    const parentFull = full.parents[fi]
    out.parents[i] = adopt(parentFull)
    const t = new THREE.Vector3(), q = new THREE.Quaternion()
    fullWorld[parentFull].clone().invert().multiply(partWorld[i]).decompose(t, q, new THREE.Vector3())
    out.pos[i] = t.toArray()
    out.rot[i] = q.toArray()
  })
  return out
}

/** The arm model's bones that the viewmodel skeleton names differently. */
/**
 * The agents' CTiltTwistConstraint target offsets (m_qOffset, xyzw): the rest the game measures the target's roll from.
 * Every agent shares them (prefab); they match the bind pose except on the upper arm (~30° off; arm_upper_R_TWIST1 has
 * its own), where measuring from the bind turned the upper-arm twist bones up to ~17° off in the menu idles.
 */
const TWIST_OFFSET: Record<string, THREE.Quaternion> = Object.fromEntries(Object.entries({
  arm_lower_L_TWIST: [0.685, -0.003, 0.036, 0.728], arm_lower_L_TWIST1: [0.685, -0.003, 0.036, 0.728],
  arm_lower_R_TWIST: [0.685, -0.003, 0.036, 0.728], arm_lower_R_TWIST1: [0.685, -0.003, 0.036, 0.728],
  arm_upper_L_TWIST: [0.039, -0.063, 0.344, 0.936], arm_upper_L_TWIST1: [0.039, -0.063, 0.344, 0.936],
  arm_upper_R_TWIST: [0.039, -0.063, 0.344, 0.936], arm_upper_R_TWIST1: [0.141, -0.307, 0.164, 0.927],
}).map(([bone, q]) => [bone, new THREE.Quaternion(...q).normalize()]))

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]

/** The roll (radians) of rotation `q` about `axis`: its swing-twist decomposition's twist angle. */
function twistAngle(q: THREE.Quaternion, axis: THREE.Vector3): number {
  const p = axis.x * q.x + axis.y * q.y + axis.z * q.z
  return 2 * Math.atan2(p, q.w)
}

/**
 * Per model bone: the skinning matrix (glTF space) taking the bind pose to the animation's pose. Bones the animation
 * names take its pose. The rest (twist bones, scapulae, jiggle bones) follow their parent's deformation — not its
 * frame: an animation skeleton's rest axes can differ a little from the model's (the third-person UI clips against
 * an agent's own skeleton), and a child placed in the parent's frame would then slide off (stretched sleeves) — and
 * the twist bones also take their share of their target's roll, as the model's CTiltTwistConstraints do in game,
 * measured the same way (the target's deformation relative to its parent's, in the target's bind frame).
 */
export function skinMatrices(arms: ArmsSkeleton, vm: ViewmodelPose): THREE.Matrix4[] {
  /** Model-space bind per bone; a parent may come after its child (ancestors appended by adoptAncestors). */
  const bind: THREE.Matrix4[] = []
  const bindOf = (i: number): THREE.Matrix4 => {
    if (!bind[i]) {
      const m = local(arms.pos[i], arms.rot[i])
      bind[i] = arms.parents[i] < 0 ? m : bindOf(arms.parents[i]).clone().multiply(m)
    }
    return bind[i]
  }
  arms.bones.forEach((_, i) => bindOf(i))
  const vmWorld = worlds(vm.viewmodel)
  const index = new Map(arms.bones.map((name, i) => [name, i]))
  const twist = new Map((arms.twists ?? []).map((c) => [c.bone, c]))
  const posed: (THREE.Matrix4 | undefined)[] = []
  /** A bone's deformation (Source space): its pose × its inverse bind. */
  const deform = (i: number) => pose(i).clone().multiply(bind[i].clone().invert())

  const pose = (i: number): THREE.Matrix4 => {
    const known = posed[i]
    if (known) return known
    const name = arms.bones[i]
    /** The viewmodel's bone of the same name (the game bone-merges by name); a bone it lacks (twist, scapula…) follows its parent. */
    const j = vm.viewmodel.bones.indexOf(name)
    const parent = arms.parents[i]
    let m: THREE.Matrix4
    if (j >= 0) m = vmWorld[j].clone()
    else m = parent < 0 ? bind[i].clone() : deform(parent).multiply(bind[i])
    const c = j < 0 ? twist.get(name) : undefined
    const t = c && index.get(c.target)
    if (c && t !== undefined) {
      const tp = arms.parents[t]
      const offset = TWIST_OFFSET[name]
      let roll: number
      if (offset && tp >= 0) {
        /** As the game: the target's parent-space rotation measured from the constraint's own rest (m_qOffset), zero at bind. */
        const local = (m4: THREE.Matrix4) => new THREE.Quaternion().setFromRotationMatrix(m4)
        const posedLocal = local(pose(tp).clone().invert().multiply(pose(t)))
        const bindLocal = local(bind[tp].clone().invert().multiply(bind[t]))
        const rest = offset.clone().invert()
        roll = twistAngle(rest.clone().multiply(posedLocal), AXES[c.targetAxis]) - twistAngle(rest.multiply(bindLocal), AXES[c.targetAxis])
        roll = Math.atan2(Math.sin(roll), Math.cos(roll))
      } else {
        const relative = tp < 0 ? deform(t) : deform(tp).invert().multiply(deform(t))
        const delta = bind[t].clone().invert().multiply(relative).multiply(bind[t])
        roll = twistAngle(new THREE.Quaternion().setFromRotationMatrix(delta), AXES[c.targetAxis])
      }
      m.multiply(new THREE.Matrix4().makeRotationAxis(AXES[c.axis], roll * c.weight))
    }
    /**
     * The scapulae's CAimConstraint (agents' vmdl): each keeps aiming at scap_<side>_AIMAT, which rides on spine_2, so
     * the shoulder blade stays on the back instead of turning with the clavicle when the arm lifts. The rigid pose
     * is turned (about the bone) until its bind direction to the target points at the target again.
     */
    const side = j < 0 ? /^scapula_([LR])$/.exec(name)?.[1] : undefined
    const aim = side !== undefined ? index.get(`scap_${side}_AIMAT`) : undefined
    if (aim !== undefined) {
      const at = (mat: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(mat)
      const from = at(bind[aim]).sub(at(bind[i])).transformDirection(m.clone().multiply(bind[i].clone().invert()))
      const to = at(pose(aim)).sub(at(m)).normalize()
      const turn = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(from, to))
      const position = at(m)
      m = turn.multiply(m.setPosition(0, 0, 0)).setPosition(position)
    }
    posed[i] = m
    return m
  }

  return arms.bones.map((_, i) => toGltf(pose(i).clone().multiply(bind[i].clone().invert())))
}

/** A weapon model's bind pose of the bone its mesh hangs from (model space, Source units; build_firstperson.py). */
export type WeaponBind = [number[], number[]]

/**
 * Where the weapon model sits (glTF space, eye at the origin looking +z): the viewmodel's weapon bone × the weapon
 * skeleton's root pose × the inverse of the model's own bind pose of that bone (its mesh is authored around it).
 */
export function weaponMatrix(vm: ViewmodelPose, bind?: WeaponBind): THREE.Matrix4 {
  const posed = worlds(vm.viewmodel)
  const m = posed[vm.viewmodel.bones.indexOf('wpn')].clone()
  if (vm.weapon) {
    const w = worlds(vm.weapon)
    const i = vm.weapon.bones.indexOf('weapon_offset')
    m.multiply(w[i >= 0 ? i : 0])
  }
  if (bind) m.multiply(local(bind[0], bind[1]).invert())
  return toGltf(m)
}

/**
 * A (non-indexed) geometry with JOINTS_0 / WEIGHTS_0 that can be posed again and again (the inspect animation): it keeps
 * its bind-pose positions, normals and tangents, and each `pose` blends the skinning matrices into them (on the CPU, so
 * any material — the glove composites too — works unchanged).
 */
export class SkinnedGeometry {
  private readonly pos: Float32Array
  private readonly nor: Float32Array | null
  private readonly tan: Float32Array | null
  private readonly joints: Uint16Array
  private readonly weights: Float32Array

  constructor(readonly geometry: THREE.BufferGeometry) {
    const g = geometry
    const copy = (name: string, size: number) => {
      const a = g.getAttribute(name)
      if (!a) return null
      const out = new Float32Array(a.count * size)
      for (let v = 0; v < a.count; v++) for (let k = 0; k < size; k++) out[v * size + k] = a.getComponent(v, k)
      return out
    }
    this.pos = copy('position', 3)!
    this.nor = copy('normal', 3)
    this.tan = copy('tangent', 4)
    const idx = g.getAttribute('skinIndex'), wt = g.getAttribute('skinWeight')
    const n = this.pos.length / 3
    this.joints = new Uint16Array(n * 4)
    this.weights = new Float32Array(n * 4)
    if (idx && wt) for (let v = 0; v < n; v++) for (let k = 0; k < 4; k++) {
      this.joints[v * 4 + k] = idx.getComponent(v, k)
      this.weights[v * 4 + k] = wt.getComponent(v, k)
    }
  }

  /** The affine map the current pose applies around a bind-pose point (where something fixed to the model there goes). */
  fitAround(near: THREE.Vector3): THREE.Matrix4 {
    const posed = this.geometry.getAttribute('position')
    const raw = (i: number, v: THREE.Vector3) => { v.fromArray(this.pos, i * 3) }
    /** The vertices near the point are the same in every pose: picked once. */
    if (!this.fitPicks || !this.fitPicks.near.equals(near)) {
      const picks: number[] = []
      fitAffine(this.pos.length / 3, near, raw, (i) => { picks.push(i) })
      this.fitPicks = { near: near.clone(), picks }
    }
    return fitAffine(this.pos.length / 3, near, raw, (i, v) => { v.fromBufferAttribute(posed, i) }, this.fitPicks.picks)
  }
  private fitPicks?: { near: THREE.Vector3; picks: number[] }

  /** Blends the vertices into the pose given by `skin` (one matrix per joint, glTF space). */
  pose(skin: THREE.Matrix4[]): void {
    const g = this.geometry
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined
    const tan = g.getAttribute('tangent') as THREE.BufferAttribute | undefined
    const e = new Float32Array(16)
    const P = pos.array as Float32Array, N = nor?.array as Float32Array | undefined, T = tan?.array as Float32Array | undefined
    const tanSize = tan?.itemSize ?? 4
    for (let v = 0, n = this.pos.length / 3; v < n; v++) {
      e.fill(0)
      let total = 0
      for (let k = 0; k < 4; k++) {
        const w = this.weights[v * 4 + k]
        if (w <= 0) continue
        const s = skin[this.joints[v * 4 + k]].elements
        for (let r = 0; r < 16; r++) e[r] += s[r] * w
        total += w
      }
      const x = this.pos[v * 3], y = this.pos[v * 3 + 1], z = this.pos[v * 3 + 2]
      if (total <= 0) { P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; continue }
      P[v * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
      P[v * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      P[v * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
      const dir = (src: Float32Array, srcSize: number, dst: Float32Array, dstSize: number) => {
        const a = src[v * srcSize], b = src[v * srcSize + 1], c = src[v * srcSize + 2]
        let X = e[0] * a + e[4] * b + e[8] * c, Y = e[1] * a + e[5] * b + e[9] * c, Z = e[2] * a + e[6] * b + e[10] * c
        const l = Math.hypot(X, Y, Z) || 1
        X /= l; Y /= l; Z /= l
        dst[v * dstSize] = X; dst[v * dstSize + 1] = Y; dst[v * dstSize + 2] = Z
      }
      if (N && this.nor) dir(this.nor, 3, N, 3)
      if (T && this.tan) dir(this.tan, 4, T, tanSize)
    }
    pos.needsUpdate = true
    if (nor) nor.needsUpdate = true
    if (tan) tan.needsUpdate = true
    g.computeBoundingSphere()
  }
}

/** An inspect animation (build_firstperson.py): per bone its translations / rotations, one value if it doesn't move. */
export interface InspectTracks { bones: string[]; parents: number[]; tracks: [number[], number[]][] }
export interface InspectClip { clip: string; duration: number; frames: number; viewmodel: InspectTracks; weapon?: InspectTracks & { skeleton: string } }

function sampleTracks(t: InspectTracks, frame: number, frames: number): BonePose {
  const f0 = Math.min(frames - 1, Math.floor(frame)), f1 = Math.min(frames - 1, f0 + 1), a = frame - f0
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion()
  return {
    bones: t.bones,
    parents: t.parents,
    pose: t.tracks.map(([tr, rot]) => {
      const pos = tr.length === 3 ? tr : [0, 1, 2].map((k) => tr[f0 * 3 + k] * (1 - a) + tr[f1 * 3 + k] * a)
      let q = rot
      if (rot.length !== 4) {
        qa.fromArray(rot, f0 * 4)
        qb.fromArray(rot, f1 * 4)
        q = qa.slerp(qb, a).toArray() as number[]
      }
      return [pos, q, 1] as [number[], number[], number]
    }),
  }
}

/** The inspect animation's pose at `time` seconds (frames interpolated). */
/**
 * An additive layer over a pose (the graph's LayerBlend "Additive"): per bone, in its parent's space, the layer's
 * translation added and its rotation applied after the base's. Bones the layer lacks keep the base.
 */
export function addPose(base: BonePose, layer: BonePose): BonePose {
  const index = new Map(layer.bones.map((name, i) => [name, i]))
  const q = new THREE.Quaternion(), d = new THREE.Quaternion()
  return {
    ...base,
    pose: base.pose.map(([t, r, s], i) => {
      const j = index.get(base.bones[i])
      if (j === undefined) return [t, r, s]
      const [lt, lr] = layer.pose[j]
      q.set(r[0], r[1], r[2], r[3]).multiply(d.set(lr[0], lr[1], lr[2], lr[3]))
      return [[t[0] + lt[0], t[1] + lt[1], t[2] + lt[2]], q.toArray(), s]
    }),
  }
}

export function samplePose(clip: InspectClip, time: number): ViewmodelPose {
  const frame = Math.max(0, Math.min(1, time / clip.duration)) * (clip.frames - 1)
  const out: ViewmodelPose = { clip: clip.clip, viewmodel: sampleTracks(clip.viewmodel, frame, clip.frames) }
  if (clip.weapon) out.weapon = { ...sampleTracks(clip.weapon, frame, clip.frames), skeleton: clip.weapon.skeleton }
  return out
}

/**
 * The viewmodel graph's hand IK (viewmodel.vnmgraph, TwoBoneIK "Effector", no chain rotation): each hand reaches its
 * wpnHand bone on the weapon (both, always: WPN_DISABLE_LEFT_HAND_IK only fires inside the Deagle's inspects, whose
 * hand is already there), bending the chain above it (armUpperShoulder → arm_lower → hand); the hand keeps its rotation.
 */
export function handIK(pose: ViewmodelPose): ViewmodelPose {
  const vm = pose.viewmodel
  const out: BonePose = { ...vm, pose: vm.pose.map(([t, r, s]) => [t, [...r], s]) }
  for (const side of ['R', 'L']) {
    const c = vm.bones.indexOf(`hand_${side}`), goal = vm.bones.indexOf(`wpnHand_${side}`)
    if (c < 0 || goal < 0) continue
    const b = out.parents[c], a = out.parents[b]
    if (b < 0 || a < 0) continue
    const W = worlds(out)
    const pos = (i: number) => new THREE.Vector3().setFromMatrixPosition(W[i])
    const rot = (i: number) => new THREE.Quaternion().setFromRotationMatrix(W[i])
    const pa = pos(a), pb = pos(b), pc = pos(c), pt = pos(goal)
    const lab = pa.distanceTo(pb), lbc = pb.distanceTo(pc)
    const lat = THREE.MathUtils.clamp(pa.distanceTo(pt), Math.abs(lab - lbc) + 1e-4, lab + lbc - 1e-4)
    const angle = (u: THREE.Vector3, v: THREE.Vector3) => Math.acos(THREE.MathUtils.clamp(u.clone().normalize().dot(v.clone().normalize()), -1, 1))
    const ac = pc.clone().sub(pa), ab = pb.clone().sub(pa), ba = pa.clone().sub(pb), bc = pc.clone().sub(pb)
    const axis = ac.clone().cross(ab)
    if (axis.lengthSq() < 1e-12) axis.set(0, 0, 1).cross(ac)
    axis.normalize()
    const cosA = (lab * lab + lat * lat - lbc * lbc) / (2 * lab * lat), cosB = (lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc)
    const ra = new THREE.Quaternion().setFromAxisAngle(axis, Math.acos(THREE.MathUtils.clamp(cosA, -1, 1)) - angle(ac, ab))
    const rb = new THREE.Quaternion().setFromAxisAngle(axis, Math.acos(THREE.MathUtils.clamp(cosB, -1, 1)) - angle(ba, bc))
    /** Bend at the elbow, then the shoulder's opening, then swing the whole chain onto the target. */
    const qa = rot(a), qb = rot(b), qc = rot(c)
    const qb2 = rb.clone().multiply(qb)
    const pb2 = pa.clone().add(ab.clone().applyQuaternion(ra))
    const qa2 = ra.clone().multiply(qa), qb3 = ra.clone().multiply(qb2)
    const pc2 = pb2.clone().add(bc.clone().applyQuaternion(rb).applyQuaternion(ra))
    const swing = new THREE.Quaternion().setFromUnitVectors(pc2.sub(pa).normalize(), pt.clone().sub(pa).normalize())
    qa2.premultiply(swing); qb3.premultiply(swing)
    const pr = out.parents[a] < 0 ? new THREE.Quaternion() : rot(out.parents[a])
    out.pose[a][1] = pr.invert().multiply(qa2).toArray()
    out.pose[b][1] = qa2.clone().invert().multiply(qb3).toArray()
    out.pose[c][1] = qb3.clone().invert().multiply(qc).toArray()
  }
  return { ...pose, viewmodel: out }
}

/** A skeleton with the geometries bound to it (an agent's body or sleeves, a glove model's arms). */
export interface RigPart { skeleton: ArmsSkeleton; geometries: SkinnedGeometry[] }

/** A held weapon posable bone by bone (ModelLoader.rigWeapon): its model's skeleton and skinned meshes, and its glb path. */
export interface WeaponRig { skeleton: ArmsSkeleton; geometries: SkinnedGeometry[]; model: string }

/**
 * Whether a clip's weapon track is this model's own (its skeleton, animation/skeletons/weapons/<name>.vnmskel, named in
 * the model's file: elite → weapon_pist_elite). Another weapon's track (the menu idles share them: the AK's on the M4A4)
 * would move parts that only share a name.
 */
const ownTrack = (rig: WeaponRig, skeleton: string) => {
  const name = /([^/]+)\.vnmskel$/.exec(skeleton)?.[1]
  return !!name && new RegExp(`_${name}\\.glb$`).test(rig.model)
}

/** Poses skinned parts and the weapon they hold at one frame: bone by bone on its own track, else rigid by its bind. */
export function poseRig(parts: RigPart[], pose: ViewmodelPose, weapon?: THREE.Object3D | null, bind?: WeaponBind): void {
  for (const part of parts) {
    const skin = skinMatrices(part.skeleton, pose)
    for (const g of part.geometries) g.pose(skin)
  }
  if (!weapon) return
  const rig = weapon.userData.rig as WeaponRig | undefined
  if (rig && pose.weapon && ownTrack(rig, pose.weapon.skeleton)) {
    /** The weapon track hangs from the hand's wpn bone: one pose with wpn as its root. */
    const wpn = worlds(pose.viewmodel)[pose.viewmodel.bones.indexOf('wpn')]
    const t = new THREE.Vector3(), q = new THREE.Quaternion()
    wpn.decompose(t, q, new THREE.Vector3())
    const held: BonePose = {
      bones: ['__wpn', ...pose.weapon.bones],
      parents: [-1, ...pose.weapon.parents.map((p) => p + 1)],
      pose: [[t.toArray(), q.toArray(), 1], ...pose.weapon.pose],
    }
    const skin = skinMatrices(rig.skeleton, { clip: pose.clip, viewmodel: held })
    for (const g of rig.geometries) g.pose(skin)
    weapon.matrix.identity()
    /** What hangs on the posed mesh (the charm) follows the part of it it hangs from. */
    ;(weapon.userData.onPosed as (() => void) | undefined)?.()
    return
  }
  weapon.matrix.copy(weaponMatrix(pose, bind))
}

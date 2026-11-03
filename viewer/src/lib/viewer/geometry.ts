import * as THREE from 'three'
import type { DrawCall } from '@/lib/data/catalog'
import type { WeaponItem } from '@/lib/materials/weapon'

/** Draw calls that aren't part of the weapon in the item view: loose shells / bullets and the revolver's separate cylinder. */
export function hiddenPart(item: WeaponItem, mesh: string, call: DrawCall): boolean {
  if (/bullet/i.test(call.material)) return true
  return /^weapon_(revolver|xm1014)\|/.test(item.id) && mesh === 'body_legacy' && /\/weapon_[a-z0-9_]+\.vmat$/.test(call.material)
}

/** HD models with loose pieces next to the gun in the same mesh (the shotguns' shells, the revolver's cylinder). */
export const LOOSE_PIECES = /^weapon_(xm1014|nova|sawedoff|mag7|revolver)\|/

/**
 * Drops the triangles of every island (vertices joined by position) that lies entirely outside the biggest island's
 * bounding box: pieces floating away from the weapon.
 */
export function removeDetachedIslands(g: THREE.BufferGeometry): void {
  const idx = g.index, pos = g.getAttribute('position')
  if (!idx || g.userData.islandsRemoved) return
  g.userData.islandsRemoved = true
  const ids = new Map<string, number>(), vid = new Int32Array(pos.count), parent: number[] = []
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`
    let id = ids.get(k)
    if (id === undefined) { id = parent.length; parent.push(id); ids.set(k, id) }
    vid[i] = id
  }
  const tris = idx.count / 3
  for (let t = 0; t < tris; t++) {
    const a = find(vid[idx.getX(t * 3)])
    parent[find(vid[idx.getX(t * 3 + 1)])] = a
    parent[find(vid[idx.getX(t * 3 + 2)])] = find(a)
  }
  const boxes = new Map<number, { n: number; box: THREE.Box3 }>(), v = new THREE.Vector3()
  const root = new Int32Array(tris)
  for (let t = 0; t < tris; t++) {
    const r = find(vid[idx.getX(t * 3)])
    root[t] = r
    let e = boxes.get(r)
    if (!e) boxes.set(r, (e = { n: 0, box: new THREE.Box3() }))
    e.n++
    for (let k = 0; k < 3; k++) e.box.expandByPoint(v.fromBufferAttribute(pos, idx.getX(t * 3 + k)))
  }
  let main: { n: number; box: THREE.Box3 } | null = null
  for (const e of boxes.values()) if (!main || e.n > main.n) main = e
  if (!main || boxes.size < 2) return
  const bounds = main.box.clone().expandByScalar(main.box.getSize(v).length() * 0.02)
  const keep: number[] = []
  for (let t = 0; t < tris; t++) {
    if (!bounds.intersectsBox(boxes.get(root[t])!.box)) continue
    keep.push(idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2))
  }
  if (keep.length < idx.count) g.setIndex(keep)
}

/**
 * The affine map taking points to where they were moved to, around a point: least squares over the vertices within
 * a few units of it (rigidly bound there). `raw` and `moved` read vertex `i` (before and after the move) into a vector.
 * `cached` are the vertices to use, when already picked for this point.
 */
export function fitAffine(count: number, near: THREE.Vector3, raw: (i: number, v: THREE.Vector3) => void, moved: (i: number, v: THREE.Vector3) => void, cached?: number[]): THREE.Matrix4 {
  const from = new THREE.Vector3(), out = new THREE.Vector3()
  const picks: number[] = cached ?? []
  if (!cached) {
    for (let r = 2; picks.length < 24 && r < 64; r *= 2) {
      picks.length = 0
      for (let i = 0; i < count && picks.length < 400; i++) { raw(i, from); if (from.distanceTo(near) < r) picks.push(i) }
    }
  }
  const ata = new Array(16).fill(0), atb = [new Array(4).fill(0), new Array(4).fill(0), new Array(4).fill(0)]
  for (const i of picks) {
    raw(i, from)
    moved(i, out)
    const a = [from.x, from.y, from.z, 1], b = [out.x, out.y, out.z]
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) ata[r * 4 + c] += a[r] * a[c]
      for (let k = 0; k < 3; k++) atb[k][r] += a[r] * b[k]
    }
  }
  const inv = new THREE.Matrix4().set(...(ata as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number])).invert()
  const rows = atb.map((v) => new THREE.Vector4(...(v as [number, number, number, number])).applyMatrix4(inv))
  return new THREE.Matrix4().set(
    rows[0].x, rows[0].y, rows[0].z, rows[0].w,
    rows[1].x, rows[1].y, rows[1].z, rows[1].w,
    rows[2].x, rows[2].y, rows[2].z, rows[2].w,
    0, 0, 0, 1,
  )
}

/** The affine map a skinned mesh's bones apply around a point: raw bind-pose position → skinned position (mesh space). */
export function fitSkinning(mesh: THREE.SkinnedMesh, near: THREE.Vector3): THREE.Matrix4 {
  const pos = mesh.geometry.getAttribute('position')
  return fitAffine(pos.count, near, (i, v) => { v.fromBufferAttribute(pos, i) }, (i, v) => { mesh.getVertexPosition(i, v) })
}

/** The nearest point on a set of surface quads (corners in the game's order: triangles 0-1-2, 1-3-2) and its outward normal. */
export function snapToAnchors(quads: THREE.Vector3[][], target: THREE.Vector3, center: THREE.Vector3): { point: THREE.Vector3; normal: THREE.Vector3 } {
  let best: { point: THREE.Vector3; normal: THREE.Vector3; d: number } | null = null
  const tri = new THREE.Triangle(), p = new THREE.Vector3()
  for (const [a, b, c, d] of quads) {
    for (const [x, y, z] of [[a, b, c], [b, d, c]]) {
      tri.set(x, y, z)
      tri.closestPointToPoint(target, p)
      const dist = p.distanceToSquared(target)
      if (!best || dist < best.d) best = { point: p.clone(), normal: tri.getNormal(new THREE.Vector3()), d: dist }
    }
  }
  const hit = best!
  if (hit.normal.dot(hit.point.clone().sub(center)) < 0) hit.normal.negate()
  return hit
}

/**
 * A CLI-exported model has one primitive per draw call and no materials: tag each primitive with its mesh
 * (glTF mesh "….vmdl_c.<mesh>") and draw call, and name its material after the draw call's .vmat.
 */
export function nameDrawCalls(root: THREE.Object3D, drawCalls: Record<string, DrawCall[]>): void {
  const meshOf = (name: string) => Object.keys(drawCalls).find((m) => name.endsWith(m))
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const own = meshOf(o.name)
    const group = own ? null : o.parent
    const mesh = own ?? (group ? meshOf(group.name) : undefined)
    if (!mesh) return
    const index = group ? group.children.filter((c) => c instanceof THREE.Mesh).indexOf(o) : 0
    const call = drawCalls[mesh][index]
    o.userData.drawCall = { mesh, call }
    if (call) o.material = new THREE.MeshStandardMaterial({ name: call.material.split('/').pop()!.replace(/\.vmat$/, '') })
  })
}

/** The triangles of a non-indexed geometry whose centroid is on one side of x = 0 (sign 1: x > 0), or null. */
export function trianglesOnSide(g: THREE.BufferGeometry, sign: 1 | -1): THREE.BufferGeometry | null {
  const pos = g.getAttribute('position')
  const keep: number[] = []
  for (let t = 0; t < pos.count; t += 3) {
    const cx = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)
    if (cx * sign > 0) keep.push(t)
  }
  if (!keep.length) return null
  const out = new THREE.BufferGeometry()
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute
    const data = new (a.array.constructor as new (n: number) => THREE.TypedArray)(keep.length * 3 * a.itemSize)
    keep.forEach((t, k) => {
      for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) data[(k * 3 + v) * a.itemSize + c] = a.getComponent(t + v, c)
    })
    out.setAttribute(name, new THREE.BufferAttribute(data, a.itemSize, a.normalized))
  }
  return out
}

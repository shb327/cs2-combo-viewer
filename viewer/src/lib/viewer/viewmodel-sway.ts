import type * as THREE from 'three'
import type { Viewmodel } from './viewer-options'

const INCH = 0.0254
/** Sway: how far (radians) the weapon leans toward the pointer at the edge of the view, and how fast it follows. */
const SWAY_YAW = 0.045
const SWAY_PITCH = 0.03
const SWAY_FOLLOW = 0.08

/**
 * Places the first-person holder for one frame: the default spot plus the offsets, mirrored for the left hand, and —
 * with sway on — breathing (a bob and a roll) and, with `lean`, leaning toward the pointer.
 * @param t time in seconds
 * @param pointer the pointer over the view (−1…1 each way)
 * @param lean whether the pointer moves the weapon (off: the pointer is ignored, only the breathing is left)
 */
export function placeViewmodel(holder: THREE.Object3D, vm: Viewmodel, t: number, pointer: { x: number; y: number }, lean: boolean): void {
  const side = vm.leftHanded ? 1 : -1
  let bob = 0
  if (vm.sway) {
    bob = Math.sin(t * 1.7) * 0.0009
    const r = holder.rotation
    const x = lean ? pointer.x : 0
    const y = lean ? pointer.y : 0
    /** Applied after the mirror, so the same sign leans toward the pointer with either hand. */
    r.y += (-x * SWAY_YAW - r.y) * SWAY_FOLLOW
    r.x += (-y * SWAY_PITCH - r.x) * SWAY_FOLLOW
    r.z = Math.sin(t * 0.85) * 0.006
  } else {
    holder.rotation.set(0, 0, 0)
  }
  holder.position.set(side * vm.offsetX * INCH, vm.offsetZ * INCH + bob, vm.offsetY * INCH)
  holder.scale.set(vm.leftHanded ? -1 : 1, 1, 1)
}

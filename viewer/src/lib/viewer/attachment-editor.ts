import * as THREE from 'three'
import type { WeaponAttachments } from '@/lib/viewer/weapon-attachments'

/** What a drag changes, told as it happens (the same values as the side panel's sliders). */
export interface EditorEvents {
  /** A sticker was grabbed (it becomes the selected one). */
  onStickerPick: (index: number) => void
  /** A sticker's offset from its slot (Move ↔ / ↕). */
  onStickerMove: (index: number, offset: [number, number]) => void
  /** The charm's offset from its keychain point (Along / Height). */
  onCharmMove: (offset: [number, number]) => void
}

interface EditorHost {
  container: HTMLElement
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  /** The orbit, paused while something is dragged. */
  controls: { enabled: boolean }
  attachments: WeaponAttachments
  weaponRoot: () => THREE.Object3D | null
  /** Editing applies now (a weapon seen from outside: not in first person or its inspect animation). */
  allowed: () => boolean
}

type Drag = { kind: 'sticker'; index: number; grab: THREE.Vector2 } | { kind: 'charm' }

/**
 * Edit mode: the weapon's stickers and charm are dragged with the pointer. A press on a sticker or the charm grabs it
 * (the orbit, or the fixed inspect's turning on a map, doesn't get that press); a press anywhere else still turns it. A sticker slides over the weapon's
 * surface (in its sticker UVs, as the shader places it); the charm follows the pointer to the nearest keychain point.
 */
export class AttachmentEditor {
  private events: EditorEvents | null = null
  private drag: Drag | null = null
  /** Whether the orbit was on before a drag paused it (it's off in the fixed inspect). */
  private orbitWas = true
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()

  constructor(private readonly host: EditorHost) {
    // (capture, on the container: before the orbit controls, which listen on the canvas)
    host.container.addEventListener('pointerdown', this.down, { capture: true })
    host.container.addEventListener('pointermove', this.move)
    host.container.addEventListener('pointerup', this.up)
    host.container.addEventListener('pointercancel', this.up)
  }

  /** Turns edit mode on (with what to tell) or off. */
  setEnabled(events: EditorEvents | null): void {
    this.events = events
    if (!events) this.end()
    this.host.canvas.style.cursor = ''
  }

  dispose(): void {
    const c = this.host.container
    c.removeEventListener('pointerdown', this.down, { capture: true })
    c.removeEventListener('pointermove', this.move)
    c.removeEventListener('pointerup', this.up)
    c.removeEventListener('pointercancel', this.up)
  }

  private get active(): boolean {
    return !!this.events && this.host.allowed() && !!this.host.weaponRoot()
  }

  /** The weapon's surfaces under the pointer, nearest first. */
  private hits(e: PointerEvent): THREE.Intersection[] {
    const root = this.host.weaponRoot()
    if (!root) return []
    const r = this.host.canvas.getBoundingClientRect()
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.host.camera)
    return this.raycaster.intersectObject(root, true).filter((h) => (h.object as THREE.Mesh).visible !== false)
  }

  private inCharm(o: THREE.Object3D): boolean {
    const charm = this.host.attachments.charmObject()
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === charm) return true
    return false
  }

  /** The first hit on the weapon's paint (where stickers are), with its sticker UV. */
  private stickerHit(hits: THREE.Intersection[]): THREE.Vector2 | null {
    const materials = this.host.attachments.stickerMaterials()
    for (const h of hits) {
      if (this.inCharm(h.object)) continue
      const mesh = h.object as THREE.Mesh
      const material = Array.isArray(mesh.material) ? mesh.material[h.face?.materialIndex ?? 0] : mesh.material
      if (!materials.has(material)) return null
      const uv = h.uv1 ?? h.uv
      return uv ? uv.clone() : null
    }
    return null
  }

  /** What the pointer is over: the charm, a sticker (and where on it), or nothing. */
  private pick(e: PointerEvent): Drag | null {
    const hits = this.hits(e)
    if (!hits.length) return null
    if (this.inCharm(hits[0].object)) return { kind: 'charm' }
    const uv = this.stickerHit(hits)
    if (!uv) return null
    const index = this.host.attachments.stickerAt(uv)
    const center = index >= 0 ? this.host.attachments.stickerCenter(index) : null
    return center ? { kind: 'sticker', index, grab: center.sub(uv) } : null
  }

  private down = (e: PointerEvent) => {
    if (e.button !== 0 || !this.active || e.target !== this.host.canvas) return
    const drag = this.pick(e)
    if (!drag) return
    // Grabbed: the orbit controls must not see this press.
    e.stopPropagation()
    e.preventDefault()
    this.drag = drag
    this.orbitWas = this.host.controls.enabled
    this.host.controls.enabled = false
    this.host.canvas.setPointerCapture(e.pointerId)
    this.host.canvas.style.cursor = 'grabbing'
    if (drag.kind === 'sticker') this.events!.onStickerPick(drag.index)
  }

  private move = (e: PointerEvent) => {
    if (!this.active) return
    const drag = this.drag
    if (!drag) {
      this.host.canvas.style.cursor = e.buttons === 0 && this.pick(e) ? 'grab' : ''
      return
    }
    const hits = this.hits(e)
    if (drag.kind === 'sticker') {
      const uv = this.stickerHit(hits)
      if (!uv) return
      const offset = this.host.attachments.moveSticker(drag.index, uv.add(drag.grab))
      if (offset) this.events!.onStickerMove(drag.index, offset)
    } else {
      const hit = hits.find((h) => !this.inCharm(h.object))
      if (!hit) return
      const offset = this.host.attachments.moveCharm(hit.point)
      if (offset) this.events!.onCharmMove(offset)
    }
  }

  private up = (e: PointerEvent) => {
    if (!this.drag) return
    if (this.host.canvas.hasPointerCapture(e.pointerId)) this.host.canvas.releasePointerCapture(e.pointerId)
    this.end()
    this.host.canvas.style.cursor = 'grab'
  }

  private end(): void {
    if (!this.drag) return
    this.drag = null
    this.host.controls.enabled = this.orbitWas
  }
}

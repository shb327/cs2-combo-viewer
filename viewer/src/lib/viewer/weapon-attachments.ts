import * as THREE from 'three'
import { CHARM_MOVE_RANGE, STICKER_MOVE_RANGE } from '@/lib/config'
import { MARKUP, loadAttachments, loadStickerDef, type CharmDef, type WeaponMarkup } from '@/lib/data/attachments'
import type { Item } from '@/lib/data/items'
import { charmMaterial, type CharmPart } from '@/lib/materials/charm'
import { loadStickerSources, packStickers, type StickerDef, type StickerSources, type StickerTextures } from '@/lib/materials/sticker'
import { WeaponFinish } from '@/lib/materials/weapon'
import type { WeaponRig } from '@/lib/viewer/firstperson'
import { fitSkinning, snapToAnchors } from '@/lib/viewer/geometry'
import type { LoadSink, ModelLoader } from '@/lib/viewer/model-loader'
import type { CharmOptions, StickerOptions } from '@/lib/viewer/viewer-options'

/** The weapon the attachments go on: the viewer's item and its model (its own space: inches, Z up). */
export interface AttachmentTarget {
  item: Item | null
  weaponRoot: THREE.Object3D | null
}

/**
 * The weapon's stickers and charm, kept across loads and applied to whatever weapon `target` gives; also the
 * sticker and charm looks the viewer shows on their own.
 */
export class WeaponAttachments {
  private stickers: StickerOptions[] = []
  private charmOpts: CharmOptions | null = null
  private stickerToken = 0
  /** Each sticker's material and source textures (kept for the viewer's lifetime). */
  private stickerLooks = new Map<string, Promise<{ def: StickerDef; sources: StickerSources }>>()
  /** The weapon's stickers' packed textures (rebuilt when the set of stickers changes). */
  private stickerSet: { key: string; textures: StickerTextures } | null = null
  /** The charm on the weapon: its object, material parts, and what's needed to re-place it. */
  private charm: {
    id: string; holder: THREE.Object3D; parts: CharmPart[]
    place: (offset: [number, number], position?: [number, number, number] | null) => void
    /** The weapon mesh it hangs on, and its model space (the anchors') → that mesh's space, if they differ. */
    body: THREE.Mesh; modelToMesh: THREE.Matrix4 | null
    /** The default keychain point (the model's space), which the offset is from. */
    home: THREE.Vector3
  } | null = null
  private texCache = new Map<string, Promise<THREE.Texture>>()
  /** Bumped on every load / attachment change, so a stale async load doesn't land on a newer model. */
  private attachToken = 0

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly loader: ModelLoader,
    private readonly assetBase: string,
    private readonly sink: LoadSink,
    private readonly target: () => AttachmentTarget,
  ) {}

  /** The stickers the weapon wears (up to five, later ones on top). */
  async setStickers(list: StickerOptions[]): Promise<void> {
    this.stickers = list
    await this.applyStickers()
  }

  /** The charm on the weapon's keychain point (pattern, custom offset); null = none. */
  async setCharm(opts: CharmOptions | null): Promise<void> {
    const prev = this.charmOpts
    this.charmOpts = opts
    if (opts && prev && this.charm && this.charm.id === opts.id) {
      for (const p of this.charm.parts) p.setSeed(opts.seed)
      const moved = opts.offset[0] !== prev.offset[0] || opts.offset[1] !== prev.offset[1] || (opts.position ?? []).join() !== (prev.position ?? []).join()
      if (moved) this.charm.place(opts.offset, opts.position)
      if ((opts.sticker ?? null) !== (prev.sticker ?? null)) await this.charmSticker(this.charm.parts, opts.sticker)
      return
    }
    await this.applyCharm()
  }

  /** Puts the stickers and the charm on the newly loaded weapon. */
  apply(): Promise<unknown> {
    return Promise.all([this.applyStickers(), this.applyCharm()])
  }

  /** The weapon was cleared (its charm went with it); a late charm load is dropped. */
  reset(): void {
    this.charm = null
    this.attachToken++
  }

  dispose(): void {
    this.stickerSet?.textures.dispose()
  }

  /** The materials stickers are drawn by (the weapon's paint), to tell a sticker's surface from the rest. */
  stickerMaterials(): Set<THREE.Material> {
    return new Set(this.sink.finishes.filter((f): f is WeaponFinish => f instanceof WeaponFinish).map((f) => f.material))
  }

  /** Each sticker's placement in the sticker UVs, as the shader applies it (center, scale, turn in radians). */
  private stickerFrames(): { center: THREE.Vector2; scale: number; angle: number; slotOffset: [number, number] }[] {
    const slots = this.markup()?.stickerSlots ?? []
    if (!slots.length) return []
    return this.stickers.map((o) => {
      const slot = slots[Math.max(0, Math.min(o.slot, slots.length - 1))]
      return {
        center: new THREE.Vector2(0.5 + slot.offset[0] + o.offset[0], 0.5 + slot.offset[1] + o.offset[1]),
        scale: slot.scale / Math.max(0.05, o.scale ?? 1),
        angle: (slot.rotation + o.rotation / 360) * Math.PI * 2,
        slotOffset: slot.offset,
      }
    })
  }

  /**
   * The sticker covering a point of the sticker UVs (the top one), or -1.
   * @param uv the point (a hit's `uvSticker`)
   */
  stickerAt(uv: THREE.Vector2): number {
    const frames = this.stickerFrames()
    for (let i = frames.length - 1; i >= 0; i--) {
      const { center, scale, angle } = frames[i]
      const sx = (uv.x - center.x) * scale, sy = (uv.y - center.y) * scale
      const c = Math.cos(angle), s = Math.sin(angle)
      const kx = sx * c - sy * s + 0.5, ky = sx * s + sy * c + 0.5
      if (kx >= 0 && kx <= 1 && ky >= 0 && ky <= 1) return i
    }
    return -1
  }

  /** A sticker's center in the sticker UVs. */
  stickerCenter(index: number): THREE.Vector2 | null {
    return this.stickerFrames()[index]?.center ?? null
  }

  /**
   * Moves a sticker so its center is at `center` (sticker UVs, within the editor's range) and shows it there; returns
   * its new offset from its slot (the editor's Move ↔ / ↕).
   * @param index the sticker
   * @param center where its center goes
   */
  moveSticker(index: number, center: THREE.Vector2): [number, number] | null {
    const frame = this.stickerFrames()[index]
    if (!frame) return null
    const clamp = (v: number, r: number) => +Math.max(-r, Math.min(r, v)).toFixed(4)
    const offset: [number, number] = [clamp(center.x - 0.5 - frame.slotOffset[0], STICKER_MOVE_RANGE[0]), clamp(center.y - 0.5 - frame.slotOffset[1], STICKER_MOVE_RANGE[1])]
    this.stickers = this.stickers.map((o, i) => (i === index ? { ...o, offset } : o))
    void this.applyStickers()
    return offset
  }

  /** The charm hanging on the weapon (to pick it), or null. */
  charmObject(): THREE.Object3D | null {
    return this.charm?.holder ?? null
  }

  /**
   * Moves the charm toward a point on the weapon (snapped to the nearest keychain point, within the editor's range) and
   * shows it there; returns its new offset from the default point (the editor's Along / Height, inches).
   * @param world the point on the weapon (world space)
   */
  moveCharm(world: THREE.Vector3): [number, number] | null {
    const charm = this.charm
    if (!charm) return null
    const local = charm.body.worldToLocal(world.clone())
    if (charm.modelToMesh) local.applyMatrix4(charm.modelToMesh.clone().invert())
    const clamp = (v: number, r: number) => +Math.max(-r, Math.min(r, v)).toFixed(2)
    const offset: [number, number] = [clamp(local.x - charm.home.x, CHARM_MOVE_RANGE[0]), clamp(local.z - charm.home.z, CHARM_MOVE_RANGE[1])]
    charm.place(offset, null)
    if (this.charmOpts) this.charmOpts = { ...this.charmOpts, offset, position: null }
    return offset
  }

  /** The item's sticker slots (empty when it has no markup yet). */
  stickerSlots(): number {
    return this.markup()?.stickerSlots.length ?? 0
  }

  /** Where stickers and charms go on the current weapon: the catalog model's markup, or the hand-made one. */
  private markup(): WeaponMarkup | undefined {
    const it = this.target().item
    if (!it || it.style === 'glove') return undefined
    if (!it.drawCalls) return MARKUP[it.id]
    if (!it.stickerMask && !it.keychainAnchors?.length) return undefined
    const anchors = it.keychainAnchors ?? []
    return {
      stickerMask: it.stickerMask ?? '', stickerSlots: it.stickerMask ? it.stickerSlots ?? [] : [], keychain: [0, 0, 0],
      keychainAnchors: anchors.map((a) => a.corners as [number, number, number][]),
      keychainDefault: Math.max(0, anchors.findIndex((a) => a.default)),
    }
  }

  private texture(path: string, srgb: boolean): Promise<THREE.Texture> {
    const key = path + (srgb ? '#srgb' : '')
    let t = this.texCache.get(key)
    if (!t) { t = this.loader.textures.load(path, srgb); this.texCache.set(key, t) }
    return t
  }

  private async applyStickers(): Promise<void> {
    const markup = this.markup()
    const list = this.stickers
    const weapons = () => this.sink.finishes.filter((f): f is WeaponFinish => f instanceof WeaponFinish).slice(0, 1)
    if (!markup || !list.length || !markup.stickerSlots.length) { for (const f of weapons()) f.setStickers(null); return }
    const token = ++this.stickerToken
    const [looks, mask] = await Promise.all([Promise.all(list.map((o) => this.stickerLook(o.id))), this.texture(markup.stickerMask, false)])
    if (token !== this.stickerToken) return
    const key = list.map((o) => o.id).join('|')
    if (this.stickerSet?.key !== key) {
      const old = this.stickerSet
      this.stickerSet = { key, textures: packStickers(this.renderer, looks.map((l) => l.sources)) }
      if (old) queueMicrotask(() => old.textures.dispose())
    }
    const textures = this.stickerSet.textures
    for (const f of weapons()) f.setStickers({
      textures, mask,
      list: list.map((o, i) => {
        const slot = markup.stickerSlots[Math.max(0, Math.min(o.slot, markup.stickerSlots.length - 1))]
        return {
          def: looks[i].def, wear: o.wear,
          scale: slot.scale / Math.max(0.05, o.scale ?? 1),
          offset: [slot.offset[0] + o.offset[0], slot.offset[1] + o.offset[1]] as [number, number],
          rotation: slot.rotation + o.rotation / 360,
        }
      }),
    })
  }

  /** The charm's model with its materials (the CLI's space: meters, Y up) and its ring mesh. */
  async buildCharm(def: CharmDef): Promise<{ model: THREE.Object3D; parts: CharmPart[]; chain: THREE.Mesh | null }> {
    const keys = Object.keys(def.materials)
    const [gltf, ...parts] = await Promise.all([
      this.loader.gltf.loadAsync(this.loader.textures.url(def.model)),
      ...keys.map((k) => charmMaterial(def.materials[k], this.loader.textures, def.liquidSurface)),
    ])
    const byKey = Object.fromEntries(keys.map((k, i) => [k, parts[i]]))
    const meshes = [...new Set(keys.map((k) => k.slice(0, k.lastIndexOf('#'))))]
    const meshOf = (name: string) => meshes.find((m) => name.endsWith(m))
    const model = gltf.scene
    let chain: THREE.Mesh | null = null
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const own = meshOf(o.name)
      const group = own ? null : o.parent
      const mesh = own ?? (group ? meshOf(group.name) : undefined)
      if (!mesh) return
      const index = group ? group.children.filter((c) => c instanceof THREE.Mesh).indexOf(o) : 0
      const key = `${mesh}#${index}`
      if (byKey[key]) { o.material = byKey[key].material; byKey[key].attach?.(o) }
      if (/chain/i.test(def.materials[key]?.vmat ?? '')) chain = o
    })
    return { model, parts, chain }
  }

  /** A sticker's material and textures (decoded on demand by the dev server the first time). */
  stickerLook(id: string): Promise<{ def: StickerDef; sources: StickerSources }> {
    let look = this.stickerLooks.get(id)
    if (!look) {
      look = (async () => {
        const [att, def] = await Promise.all([loadAttachments(this.assetBase), loadStickerDef(this.assetBase, id)])
        const sources = await loadStickerSources(def, att.scratches, (p, srgb) => this.loader.textures.load(p, srgb))
        return { def, sources }
      })()
      look.catch(() => this.stickerLooks.delete(id))
      this.stickerLooks.set(id, look)
    }
    return look
  }

  /** The sticker slab's sticker (charm parts with F_STICKERS), or none. */
  async charmSticker(parts: CharmPart[], id: string | null | undefined): Promise<void> {
    const slab = parts.filter((p) => p.setSticker)
    if (!slab.length) return
    if (!id) { for (const p of slab) p.setSticker!(null); return }
    const { def, sources } = await this.stickerLook(id)
    const textures = packStickers(this.renderer, [sources])
    this.sink.disposables.push(() => textures.dispose())
    for (const p of slab) p.setSticker!({ def, textures })
  }

  private async applyCharm(): Promise<void> {
    const token = ++this.attachToken
    if (this.charm) {
      this.charm.holder.removeFromParent()
      this.charm.holder.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
      for (const p of this.charm.parts) p.material.dispose()
      this.charm = null
    }
    const { item, weaponRoot: root } = this.target()
    const markup = this.markup()
    const opts = this.charmOpts
    const def = opts ? (await loadAttachments(this.assetBase)).charm.get(opts.id) : undefined
    if (!root || !markup || !def || !opts) return
    const { model, parts, chain } = await this.buildCharm(def)
    if (token !== this.attachToken) return
    for (const p of parts) p.setSeed(opts.seed)
    await this.charmSticker(parts, opts.sticker)
    if (token !== this.attachToken) return
    const toWeapon = new THREE.Matrix4().set(
      1, 0, 0, 0,
      0, 0, -1, 0,
      0, 1, 0, 0,
      0, 0, 0, 1,
    ).premultiply(new THREE.Matrix4().makeScale(1 / 0.0254, 1 / 0.0254, 1 / 0.0254))
      .premultiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
    const probe = new THREE.Group()
    probe.add(model)
    model.matrixAutoUpdate = false
    model.matrix.copy(toWeapon)
    probe.updateMatrixWorld(true)
    const ring = new THREE.Box3().setFromObject(chain ?? model)
    const top = new THREE.Vector3((ring.min.x + ring.max.x) / 2, (ring.min.y + ring.max.y) / 2, ring.max.z)
    probe.remove(model)
    let body: THREE.Mesh | null = null
    root.traverse((o) => { if (!body && o instanceof THREE.Mesh && o.visible) body = o })
    if (!body) return
    const mesh = body as THREE.Mesh
    const holder = new THREE.Group()
    holder.matrixAutoUpdate = false
    holder.add(model)
    model.matrix.identity()
    mesh.geometry.computeBoundingBox()
    const modelToMesh = item?.drawCalls ? new THREE.Matrix4().set(
      0, 0.0254, 0, 0,
      0, 0, 0.0254, 0,
      0.0254, 0, 0, 0,
      0, 0, 0, 1,
    ) : null
    const center = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3())
    if (modelToMesh) center.applyMatrix4(modelToMesh.clone().invert())
    const quads = markup.keychainAnchors.map((q) => q.map((c) => new THREE.Vector3(...c)))
    const home = quads[markup.keychainDefault].reduce((a, c) => a.add(c), new THREE.Vector3()).multiplyScalar(0.25)
    const halfRing = (ring.max.y - ring.min.y) / 2
    /** A rigged weapon (first person) is posed vertex by vertex: the charm follows the posed surface where it hangs. */
    const skinned = (root.userData.rig as WeaponRig | undefined)?.geometries.find((g) => g.geometry === mesh.geometry)
    const follow = new THREE.Matrix4(), base = new THREE.Matrix4(), hangAt = new THREE.Vector3()
    const settle = () => {
      if (skinned) follow.copy(skinned.fitAround(hangAt))
      holder.matrix.copy(follow).multiply(base)
      holder.matrixWorldNeedsUpdate = true
    }
    const place = (offset: [number, number], position?: [number, number, number] | null) => {
      const start = position ? new THREE.Vector3(...position) : home
      const target = start.clone().add(new THREE.Vector3(offset[0], 0, offset[1]))
      const hit = snapToAnchors(quads, target, center)
      const facesAway = hit.normal.y < 0
      const anchor = hit.point.clone().addScaledVector(hit.normal, halfRing)
      const toDrawn = modelToMesh ?? (mesh instanceof THREE.SkinnedMesh ? fitSkinning(mesh, anchor) : new THREE.Matrix4())
      base.copy(toDrawn)
        .multiply(new THREE.Matrix4().makeTranslation(anchor))
        .multiply(new THREE.Matrix4().makeRotationZ(facesAway ? Math.PI : 0))
        .multiply(new THREE.Matrix4().makeTranslation(top.clone().negate()))
        .multiply(toWeapon)
      hangAt.copy(anchor).applyMatrix4(modelToMesh ?? new THREE.Matrix4())
      settle()
    }
    place(opts.offset, opts.position)
    if (skinned) root.userData.onPosed = settle
    mesh.add(holder)
    this.charm = { id: opts.id, holder, parts, place, body: mesh, modelToMesh, home }
  }
}

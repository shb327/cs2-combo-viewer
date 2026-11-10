import { ASSET_BASE } from '@/lib/config'
import { catalogItem, loadItemData, loadKitData } from '@/lib/data/catalog'
import type { GloveItem, Item } from '@/lib/data/items'
import { loadCounts, onLoadProgress, resetLoadProgress } from '@/lib/load-progress'
import { SkinViewer } from '@/lib/viewer/skin-viewer'
import { DEFAULT_LIGHTING, DEFAULT_VIEWMODEL } from '@/lib/viewer/viewer-options'
import { comboKey, type ComboErrorCode, type ComboView, type ResolvedCombo, type ResolvedFinish } from './combo'

/** What the embed draws: a combo, in a view, on a map. */
export interface ComboScene { combo: ResolvedCombo; view: ComboView; map: string }

export interface RunnerEvents {
  progress(loaded: number, total: number): void
  /** The scene asked for has been drawn and presented (a frame of it is on screen). */
  loaded(): void
  /** @param kept the last drawn scene is still on screen (or being put back: `restored` follows) */
  error(code: ComboErrorCode, message: string, retryable: boolean, kept: boolean): void
  recovering(attempt: number): void
  /** After an error with `kept` that had to load the old scene again, once it is back on screen. */
  restored?(): void
  /** With `capture`: the loaded combo's frame is final. */
  captureReady?(): void
}

export interface RunnerOptions {
  /**
   * For screenshots: pixel ratio 1 with no adaptive resolution, the sway off and the pose held at the idle's start, the
   * background fetched so the frame can be read back (`capture()`), and `captureReady` once the frame is final.
   */
  capture?: boolean
  /** The game's input (`input=game`): the mouse never moves the view (the page plays the swings on clicks). */
  gameInput?: boolean
}

/** Drawn frames in a row with nothing loading before a capture's frame counts as final. */
const STILL_FRAMES = 2

/**
 * Rebuilds after a lost WebGL context; a second loss before the combo has loaded again and the page is told instead
 * (it can show the screenshot).
 */
const MAX_RECOVERIES = 1
/** The wait before the rebuild: a GPU that has just reset may refuse a new context for a moment. */
const RECOVER_DELAY_MS = 300
const PROGRESS_INTERVAL_MS = 100

/** Only the map differs: the combo, its agent and the view are the same. */
const sameButMap = (a: ComboScene, b: ComboScene) => a.view === b.view && comboKey(a.combo) === comboKey(b.combo)

class MapError extends Error {}

/**
 * The viewer behind the combo embed: loads a combo, and when the WebGL context is lost (a GPU reset, often during a
 * long cold shader compile) throws the viewer away, its context released, and rebuilds it on a fresh canvas with the
 * same combo. Kept apart from the page so that three.js is only fetched where WebGL2 exists.
 */
export class ComboRunner {
  private viewer: SkinViewer | null = null
  /** The scene being shown or loaded (rebuilt after a lost context). */
  private current: ComboScene | null = null
  /** The last scene drawn in full. */
  private drawnScene: ComboScene | null = null
  private token = 0
  private losses = 0
  private stopProgress: (() => void) | null = null
  private recoverTimer = 0
  private stillFrame = 0
  private readonly observer: IntersectionObserver | null

  constructor(private readonly container: HTMLElement, private readonly events: RunnerEvents, private readonly options: RunnerOptions = {}) {
    this.observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => this.viewer?.setPaused(!entry.isIntersecting))
    this.observer?.observe(container)
    // At once, before any combo: the map's background goes up while the catalog and the combo's files load.
    this.createViewer()
  }

  /** The viewer's GPU resources (three.js' counts), for the checks. */
  get info(): { textures: number; geometries: number; programs: number } | null {
    const r = this.viewer?.renderer
    return r ? { textures: r.info.memory.textures, geometries: r.info.memory.geometries, programs: r.info.programs?.length ?? 0 } : null
  }

  /** The last scene drawn in full (null: none, or cleared after an error). */
  get drawn(): ComboScene | null {
    return this.drawnScene
  }

  /**
   * Shows a scene (its combo resolved against the catalog). When only the map differs from the scene drawn, only the
   * map changes. `loaded` follows once a frame of it has been presented.
   * @param fresh a new request from the page (the loss count starts again); false for a rebuild after a loss
   * @param keep the scene drawn now, when the new one only changes its agent or map: if the new one fails, this one
   *   stays (or is put back) instead of an empty view
   */
  load(scene: ComboScene, { fresh = true, keep = null }: { fresh?: boolean; keep?: ComboScene | null } = {}): void {
    const token = ++this.token
    clearTimeout(this.recoverTimer)
    cancelAnimationFrame(this.stillFrame)
    if (fresh) this.losses = 0
    this.current = scene
    const viewer = this.viewer ?? this.createViewer()
    if (!viewer) return
    this.followProgress(token)
    const mapOnly = fresh && !!this.drawnScene && sameButMap(this.drawnScene, scene)
    const work = mapOnly ? this.showMap(viewer, scene.map) : this.show(viewer, scene)
    work
      .then(() => viewer.whenDrawn())
      .then(() => {
        if (token !== this.token) return
        this.endProgress()
        // Only losses in a row count: a GPU reset long after the combo loaded is rebuilt again.
        this.losses = 0
        this.drawnScene = scene
        this.events.loaded()
        if (this.options.capture) this.watchStill(token, viewer)
        // The game's input: the swings' clips now, so the first click plays at once.
        if (this.options.gameInput) viewer.preloadSwings()
      })
      .catch((e: Error) => {
        // A load that failed because the context went is the loss handler's to deal with.
        if (token !== this.token || this.isLost(viewer)) return
        this.endProgress()
        const message = e instanceof MapError ? e.message : `The combo's files couldn't be loaded: ${e.message}`
        if (keep && this.drawnScene) {
          // The old map stayed; after a change of agent the old arms are loaded again (from the cache).
          if (!mapOnly) this.restore(viewer, keep)
          this.current = keep
          this.events.error('assets-unavailable', message, true, true)
          if (mapOnly) this.events.restored?.()
          return
        }
        this.drawnScene = null
        viewer.unload()
        this.events.error('assets-unavailable', message, true, false)
      })
  }

  /** Puts a scene back after a failed change of agent, under the page's frozen frame; then `restored`. */
  private restore(viewer: SkinViewer, scene: ComboScene): void {
    const token = ++this.token
    this.show(viewer, scene)
      .then(() => viewer.whenDrawn())
      .then(() => {
        if (token !== this.token) return
        this.drawnScene = scene
        this.events.restored?.()
      })
      .catch(() => {
        // Not even the old scene: the frozen frame stays; the page can load again.
        if (token === this.token) this.drawnScene = null
      })
  }

  /** Clears the scene (an error is shown instead). */
  unload(): void {
    this.token++
    this.endProgress()
    this.drawnScene = null
    this.viewer?.unload()
  }

  inspect(): void { this.viewer?.inspect() }

  /** The knife's actions built for the combo drawn: its inspect and swings (none outside first person). */
  get actions(): ('inspect' | 'light' | 'heavy')[] {
    const v = this.viewer
    return v ? [...(v.canInspect ? ['inspect' as const] : []), ...v.swings] : []
  }

  /** The swings the first-person knife has (`light`, `heavy`). */
  get swings(): ('light' | 'heavy')[] {
    return this.viewer?.swings ?? []
  }

  swing(kind: 'light' | 'heavy'): void { this.viewer?.swing(kind) }

  /** The last frame with the map's background under it, to show while the next scene loads. */
  snapshot(): HTMLCanvasElement | null {
    return this.viewer && !this.isLost(this.viewer) ? this.viewer.snapshotCanvas(true) : null
  }

  /**
   * With `capture`: the frame shown, background included, as a PNG at the canvas' size.
   * @returns null when nothing is loaded (or the view is gone)
   */
  async capture(): Promise<{ png: Blob; width: number; height: number; coverage: number } | null> {
    const viewer = this.viewer
    if (!this.options.capture || !viewer || this.isLost(viewer)) return null
    const { canvas, coverage } = viewer.captureCanvas()
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return png ? { png, width: canvas.width, height: canvas.height, coverage: Math.round(coverage * 1000) / 1000 } : null
  }

  /** Testing aid: loses the context the way a GPU reset does. */
  loseContext(): void {
    this.viewer?.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext()
  }

  dispose(): void {
    this.token++
    clearTimeout(this.recoverTimer)
    cancelAnimationFrame(this.stillFrame)
    this.endProgress()
    this.observer?.disconnect()
    this.dropViewer()
  }

  private async show(viewer: SkinViewer, { combo, view, map }: ComboScene): Promise<void> {
    // The map loads next to the combo (the viewer started the default one at once).
    const mapDone = this.showMap(viewer, map)
    mapDone.catch(() => {})
    const [knife, gloves] = await Promise.all([finishItem(combo.knife), finishItem(combo.gloves)])
    viewer.setViewmodel({ gloveFloat: combo.gloves.float, gloveSeed: combo.gloves.seed })
    if (view === 'fp') await viewer.loadFirstPerson(knife, gloves as GloveItem, combo.agent)
    else await viewer.load(knife)
    viewer.setFloat(combo.knife.float)
    viewer.setSeed(combo.knife.seed)
    await mapDone
  }

  /** Puts the map in place; a map that can't be loaded is an error (never the studio instead). */
  private async showMap(viewer: SkinViewer, map: string): Promise<void> {
    const ok = await viewer.setMap(map)
    if (!ok && viewer.mapId !== map) throw new MapError(`The map ${map} couldn't be loaded.`)
  }

  /**
   * Waits for the loaded combo's frame to be final: every file loaded, the background in, then `STILL_FRAMES` frames
   * drawn in a row with that still true (the composites and the texture uploads happen in the first).
   */
  private watchStill(token: number, viewer: SkinViewer): void {
    cancelAnimationFrame(this.stillFrame)
    let still = 0
    const step = () => {
      if (token !== this.token || viewer !== this.viewer) return
      const { loaded, total } = loadCounts()
      still = loaded >= total && viewer.backgroundReady ? still + 1 : 0
      if (still > STILL_FRAMES) this.events.captureReady?.()
      else this.stillFrame = requestAnimationFrame(step)
    }
    this.stillFrame = requestAnimationFrame(step)
  }

  private createViewer(): SkinViewer | null {
    let viewer: SkinViewer
    const capture = !!this.options.capture
    try {
      viewer = new SkinViewer(this.container, {
        assetBase: ASSET_BASE, background: null, antialias: true, readableBackground: capture,
        // Phones get the map too. A change of map keeps the old one until the new one is in, under the page's frozen
        // frame. Clicks are the page's (input=game): the viewer's own click attacks stay off.
        mapOnMobile: true, mapVeil: false, pointerAttacks: false,
      })
    } catch (e) {
      this.events.error('context-lost', `The browser couldn't start 3D (${(e as Error).message}).`, true, false)
      return null
    }
    viewer.setLighting({ ...DEFAULT_LIGHTING })
    viewer.setViewmodel({ ...DEFAULT_VIEWMODEL, leftHanded: false, sway: !capture })
    if (this.options.gameInput) viewer.setCameraInput(false)
    if (capture) {
      viewer.setQuality({ resolution: 1, antialias: true, post: true, adaptive: false })
      viewer.setStillTime(0)
    }
    viewer.renderer.domElement.addEventListener('webglcontextlost', (e) => this.onContextLost(viewer, e))
    if (import.meta.env.DEV) Object.assign(window, { __viewer: viewer })
    this.viewer = viewer
    return viewer
  }

  private onContextLost(viewer: SkinViewer, e: Event): void {
    e.preventDefault()
    if (viewer !== this.viewer) return
    this.token++
    this.endProgress()
    this.dropViewer()
    this.drawnScene = null
    this.losses++
    if (!this.current) return
    if (this.losses > MAX_RECOVERIES) {
      this.events.error('context-lost', 'The graphics card stopped drawing (its WebGL context was lost).', true, false)
      return
    }
    this.events.recovering(this.losses)
    const scene = this.current
    this.recoverTimer = window.setTimeout(() => this.load(scene, { fresh: false }), RECOVER_DELAY_MS)
  }

  private dropViewer(): void {
    const viewer = this.viewer
    this.viewer = null
    viewer?.dispose()
  }

  private isLost(viewer: SkinViewer): boolean {
    return viewer.renderer.getContext().isContextLost()
  }

  private followProgress(token: number): void {
    this.endProgress()
    resetLoadProgress()
    let last = 0
    const send = () => {
      if (token !== this.token) return
      last = performance.now()
      const { loaded, total } = loadCounts()
      this.events.progress(loaded, total)
    }
    send()
    let timer = 0
    const off = onLoadProgress(() => {
      if (performance.now() - last >= PROGRESS_INTERVAL_MS) send()
      else if (!timer) timer = window.setTimeout(() => { timer = 0; send() }, PROGRESS_INTERVAL_MS)
    })
    this.stopProgress = () => { off(); clearTimeout(timer) }
  }

  private endProgress(): void {
    this.stopProgress?.()
    this.stopProgress = null
  }
}

async function finishItem(f: ResolvedFinish): Promise<Item> {
  const [itemData, kitData] = await Promise.all([loadItemData(ASSET_BASE, f.item), loadKitData(ASSET_BASE, f.kit)])
  return catalogItem(itemData, kitData, f.seed)
}

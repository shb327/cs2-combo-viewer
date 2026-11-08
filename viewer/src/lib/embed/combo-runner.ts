import { ASSET_BASE } from '@/lib/config'
import { catalogItem, loadItemData, loadKitData } from '@/lib/data/catalog'
import type { GloveItem, Item } from '@/lib/data/items'
import { loadCounts, onLoadProgress, resetLoadProgress } from '@/lib/load-progress'
import { SkinViewer } from '@/lib/viewer/skin-viewer'
import { DEFAULT_LIGHTING, DEFAULT_VIEWMODEL } from '@/lib/viewer/viewer-options'
import type { ComboErrorCode, ComboView, ResolvedCombo, ResolvedFinish } from './combo'

export interface RunnerEvents {
  progress(loaded: number, total: number): void
  loaded(): void
  error(code: ComboErrorCode, message: string, retryable: boolean): void
  recovering(attempt: number): void
}

/**
 * Rebuilds after a lost WebGL context; a second loss before the combo has loaded again and the page is told instead
 * (it can show the screenshot).
 */
const MAX_RECOVERIES = 1
/** The wait before the rebuild: a GPU that has just reset may refuse a new context for a moment. */
const RECOVER_DELAY_MS = 300
const PROGRESS_INTERVAL_MS = 100

/**
 * The viewer behind the combo embed: loads a combo, and when the WebGL context is lost (a GPU reset, often during a
 * long cold shader compile) throws the viewer away, its context released, and rebuilds it on a fresh canvas with the
 * same combo. Kept apart from the page so that three.js is only fetched where WebGL2 exists.
 */
export class ComboRunner {
  private viewer: SkinViewer | null = null
  private current: { combo: ResolvedCombo; view: ComboView } | null = null
  private token = 0
  private losses = 0
  private stopProgress: (() => void) | null = null
  private recoverTimer = 0
  private readonly observer: IntersectionObserver | null

  constructor(private readonly container: HTMLElement, private readonly events: RunnerEvents) {
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

  /**
   * Shows a combo (resolved against the catalog).
   * @param fresh a new request from the page (the loss count starts again); false for a rebuild after a loss
   */
  load(combo: ResolvedCombo, view: ComboView, fresh = true): void {
    const token = ++this.token
    clearTimeout(this.recoverTimer)
    if (fresh) this.losses = 0
    this.current = { combo, view }
    const viewer = this.viewer ?? this.createViewer()
    if (!viewer) return
    this.followProgress(token)
    this.show(viewer, combo, view)
      .then(() => {
        if (token !== this.token) return
        this.endProgress()
        // Only losses in a row count: a GPU reset long after the combo loaded is rebuilt again.
        this.losses = 0
        this.events.loaded()
      })
      .catch((e: Error) => {
        // A load that failed because the context went is the loss handler's to deal with.
        if (token !== this.token || this.isLost(viewer)) return
        this.endProgress()
        viewer.unload()
        this.events.error('assets-unavailable', `The combo's files couldn't be loaded: ${e.message}`, true)
      })
  }

  /** Clears the scene (an error is shown instead). */
  unload(): void {
    this.token++
    this.endProgress()
    this.viewer?.unload()
  }

  inspect(): void { this.viewer?.inspect() }

  /** The last frame, to show while the next combo loads. */
  snapshot(): HTMLCanvasElement | null {
    return this.viewer && !this.isLost(this.viewer) ? this.viewer.snapshotCanvas() : null
  }

  /** Testing aid: loses the context the way a GPU reset does. */
  loseContext(): void {
    this.viewer?.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext()
  }

  dispose(): void {
    this.token++
    clearTimeout(this.recoverTimer)
    this.endProgress()
    this.observer?.disconnect()
    this.dropViewer()
  }

  private async show(viewer: SkinViewer, combo: ResolvedCombo, view: ComboView): Promise<void> {
    const [knife, gloves] = await Promise.all([finishItem(combo.knife), finishItem(combo.gloves)])
    viewer.setViewmodel({ gloveFloat: combo.gloves.float, gloveSeed: combo.gloves.seed })
    if (view === 'fp') await viewer.loadFirstPerson(knife, gloves as GloveItem, combo.agent)
    else await viewer.load(knife)
    viewer.setFloat(combo.knife.float)
    viewer.setSeed(combo.knife.seed)
  }

  private createViewer(): SkinViewer | null {
    let viewer: SkinViewer
    try {
      viewer = new SkinViewer(this.container, { assetBase: ASSET_BASE, background: null, antialias: true })
    } catch (e) {
      this.events.error('context-lost', `The browser couldn't start 3D (${(e as Error).message}).`, true)
      return null
    }
    viewer.setLighting({ ...DEFAULT_LIGHTING })
    viewer.setViewmodel({ ...DEFAULT_VIEWMODEL, leftHanded: false })
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
    this.losses++
    if (!this.current) return
    if (this.losses > MAX_RECOVERIES) {
      this.events.error('context-lost', 'The graphics card stopped drawing (its WebGL context was lost).', true)
      return
    }
    this.events.recovering(this.losses)
    const { combo, view } = this.current
    this.recoverTimer = window.setTimeout(() => this.load(combo, view, false), RECOVER_DELAY_MS)
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

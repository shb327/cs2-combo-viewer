import { useEffect, useRef } from 'react'
import { DEFAULT_FLOAT } from '@/lib/config'
import type { Item } from '@/lib/data/items'
import type { Selection } from '@/lib/selection'
import { clampFloat } from '@/lib/wear'
import type { KnifePose, SkinViewer } from '@/lib/viewer/skin-viewer'
import type { LoadStatus } from '@/hooks/use-skin-loader'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'

export interface ViewOptions {
  spin: boolean
  palmUp: boolean
  /** How knives stand (other items ignore it). */
  knifePose: KnifePose
  /** The item seen from its other side (a half turn around it). */
  back: boolean
}

/**
 * Pushes the live state (wear, pattern, stickers, charm, view options) into the viewer without reloading the model.
 * @param viewer the 3D viewer
 * @param selection what is shown
 * @param item the loaded skin, if any
 * @param status the load status: item-level settings wait for it to be ready
 * @param state the URL state
 * @param view the view options
 */
export function useViewerSync(viewer: SkinViewer | null, selection: Selection, item: Item | null, status: LoadStatus, state: ViewerStateApi, view: ViewOptions): void {
  const ready = status === 'ready'
  const isSkin = selection.kind === 'skin' && !!item
  const float = item ? clampFloat(item, state.float ?? DEFAULT_FLOAT) : null

  useEffect(() => {
    if (viewer && isSkin && ready && float !== null) viewer.setFloat(float)
  }, [viewer, isSkin, ready, float])

  useEffect(() => {
    if (viewer && isSkin && ready) viewer.setSeed(state.seed)
  }, [viewer, isSkin, ready, state.seed])

  useEffect(() => {
    if (viewer) viewer.autoRotate = view.spin
  }, [viewer, view.spin])

  useEffect(() => {
    if (viewer && isSkin && ready) viewer.setGlovePalmUp(view.palmUp)
  }, [viewer, isSkin, ready, view.palmUp])

  /** The knife's pose and the side shown; a new model starts from the framing again, so they are applied once it is ready. */
  const wasBack = useRef(false)
  useEffect(() => {
    if (!viewer || !isSkin || !ready) return
    viewer.setKnifePose(view.knifePose)
    if (view.back) viewer.backView()
    else if (wasBack.current) viewer.resetView()
    wasBack.current = view.back
  }, [viewer, isSkin, ready, item, view.knifePose, view.back])

  const stickersKey = JSON.stringify(state.stickers)
  useEffect(() => {
    if (viewer) void viewer.setStickers(state.stickers)
  }, [viewer, stickersKey])

  const charm = state.charmOptions
  useEffect(() => {
    if (viewer) void viewer.setCharm(charm)
  }, [viewer, charm])

  useEffect(() => {
    if (viewer && selection.kind === 'charm' && ready) viewer.setStandaloneSeed(state.charm.seed)
  }, [viewer, selection.kind, ready, state.charm.seed])

  useEffect(() => {
    if (viewer && selection.kind === 'sticker' && ready) viewer.setStandaloneWear(state.stickerWear)
  }, [viewer, selection.kind, ready, state.stickerWear])

  useEffect(() => {
    if (viewer && selection.kind === 'sticker' && ready) viewer.setStandaloneCard(state.stickerCard)
  }, [viewer, selection.kind, ready, state.stickerCard])

  useEffect(() => {
    if (viewer && selection.kind === 'charm' && ready) void viewer.setStandaloneCharmSticker(state.charm.sticker)
  }, [viewer, selection.kind, ready, state.charm.sticker])
}

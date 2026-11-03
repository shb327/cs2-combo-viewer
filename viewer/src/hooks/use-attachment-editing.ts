import { useEffect, useRef } from 'react'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'

/**
 * Edit mode on the viewer while `enabled`: dragging a sticker selects it in the side panel and moves it (its Move ↔ / ↕),
 * dragging the charm moves it along the weapon (its Along / Height) — the same values the sliders change.
 */
export function useAttachmentEditing(viewer: SkinViewer | null, enabled: boolean, state: ViewerStateApi, onActiveSticker: (index: number) => void): void {
  const latest = useRef({ state, onActiveSticker })
  latest.current = { state, onActiveSticker }

  useEffect(() => {
    if (!viewer) return
    viewer.setEditing(enabled ? {
      onStickerPick: (index) => latest.current.onActiveSticker(index),
      onStickerMove: (index, offset) => {
        const { stickers, setStickers } = latest.current.state
        setStickers(stickers.map((s, i) => (i === index ? { ...s, offset } : s)))
      },
      onCharmMove: (offset) => latest.current.state.setCharm({ offset, position: null }),
    } : null)
    return () => viewer.setEditing(null)
  }, [viewer, enabled])
}

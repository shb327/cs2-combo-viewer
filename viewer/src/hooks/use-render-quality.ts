import { useStoredSettings } from '@/hooks/use-stored-settings'
import { DEFAULT_RENDER_QUALITY, type RenderQuality } from '@/lib/viewer/viewer-options'

/** How finely the viewer draws, remembered in this browser (a per-device preference). */
export function useRenderQuality() {
  const [quality, setQuality] = useStoredSettings<RenderQuality>('render-quality', DEFAULT_RENDER_QUALITY)
  return { quality, setQuality }
}

import { useEffect, useState, type RefObject } from 'react'
import { ASSET_BASE } from '@/lib/config'
import { SkinViewer } from '@/lib/viewer/skin-viewer'

/**
 * Creates the 3D viewer inside a container for the lifetime of the component (again when `antialias` changes: a canvas
 * keeps the antialiasing it was made with).
 * @param container the element the canvas is appended to
 * @param antialias multisampled edges
 */
export function useViewer(container: RefObject<HTMLElement | null>, antialias = true): SkinViewer | null {
  const [viewer, setViewer] = useState<SkinViewer | null>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const created = new SkinViewer(element, { assetBase: ASSET_BASE, background: null, antialias })
    if (import.meta.env.DEV) Object.assign(window, { __viewer: created })
    setViewer(created)
    return () => {
      created.dispose()
      setViewer(null)
    }
  }, [container, antialias])

  return viewer
}

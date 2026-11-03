import { useEffect, type RefObject } from 'react'
import { emit } from '@/lib/embed'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'

export function useEmbedViewerSetup(viewer: SkinViewer | null, container: RefObject<HTMLElement | null>, quality: { lite: boolean; max: boolean }): void {
  const { lite, max } = quality

  useEffect(() => {
    if (viewer && lite) viewer.setQuality({ resolution: 1, antialias: false, post: true, adaptive: false })
  }, [viewer, lite])

  useEffect(() => {
    if (viewer && max) viewer.setQuality({ resolution: 'auto', antialias: true, post: true, adaptive: false })
  }, [viewer, max])

  useEffect(() => {
    const el = container.current
    if (!viewer || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => viewer.setPaused(!entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [viewer, container])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit({ type: 'cs3d:key', key: 'Escape' }) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

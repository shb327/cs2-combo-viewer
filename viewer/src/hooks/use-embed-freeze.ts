import { useEffect, useLayoutEffect, useState } from 'react'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'

export function useEmbedFreeze(viewer: SkinViewer | null, status: string, reloadKeys: readonly unknown[]): { frozen: HTMLCanvasElement | null; thawing: boolean } {
  const [frozen, setFrozen] = useState<HTMLCanvasElement | null>(null)
  const [thawing, setThawing] = useState(false)

  useLayoutEffect(() => {
    if (!viewer || status !== 'ready') return
    setFrozen(viewer.snapshotCanvas())
    setThawing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, reloadKeys)

  useEffect(() => {
    if (!frozen || status !== 'ready') return
    setThawing(true)
    const timer = setTimeout(() => { setFrozen(null); setThawing(false) }, 400)
    return () => clearTimeout(timer)
  }, [frozen, status])

  return { frozen, thawing }
}

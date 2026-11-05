import { useEffect, useState } from 'react'
import { onLoadProgress, resetLoadProgress } from '@/lib/load-progress'

/**
 * A thin bar along the bottom while the item loads, shown even without the embed's UI: the background is up within a
 * second, the item can take tens of seconds on a slow connection.
 */
export function LoadProgress({ loading }: { loading: boolean }) {
  const [share, setShare] = useState(0)
  useEffect(() => {
    if (!loading) return
    resetLoadProgress()
    return onLoadProgress(setShare)
  }, [loading])
  if (!loading) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[3px] bg-black/30" role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
      <div className="h-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, share * 100)}%` }} />
    </div>
  )
}

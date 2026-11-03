import { useEffect, useState } from 'react'
import { charmGradient } from '@/lib/charm-gradient'
import { ASSET_BASE } from '@/lib/config'
import type { CharmDef } from '@/lib/data/attachments'

/** The color bar of a charm's pattern slider; undefined until it is computed. */
export function useCharmGradient(charm: CharmDef | undefined): string | undefined {
  const [result, setResult] = useState<{ id: string; gradient: string } | null>(null)
  useEffect(() => {
    if (!charm) return
    let cancelled = false
    void charmGradient(charm, ASSET_BASE).then((gradient) => { if (!cancelled) setResult({ id: charm.id, gradient }) })
    return () => { cancelled = true }
  }, [charm])
  return charm && result?.id === charm.id ? result.gradient : undefined
}

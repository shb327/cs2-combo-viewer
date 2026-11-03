import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex } from '@/lib/data/catalog'
import { emit, resolveTarget, type EmbedOptions, type EmbedTarget } from '@/lib/embed'
import type { Selection } from '@/lib/selection'

interface Inputs {
  initialTarget: EmbedTarget | null
  initialStickers: string | null
  pendingOptions: MutableRefObject<EmbedOptions>
  catalog: CatalogIndex | null
  attachments: AttachmentIndex | null
  agents: AgentIndex | null
  state: ViewerStateApi
  applyOptions: (options: EmbedOptions) => void
}

export function useEmbedTarget({ initialTarget, initialStickers, pendingOptions, catalog, attachments, agents, state, applyOptions }: Inputs) {
  const [target, setTarget] = useState<EmbedTarget | null>(initialTarget)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [error, setError] = useState('')
  const firstStickers = useRef(initialStickers)

  useEffect(() => {
    if (!target || !catalog || !attachments) return
    const resolved = resolveTarget(target, catalog, attachments, agents)
    if (typeof resolved === 'string') {
      setError(resolved)
      emit({ type: 'cs3d:error', message: resolved })
      return
    }
    setError('')
    const o = pendingOptions.current
    pendingOptions.current = {}
    state.patch({
      st: firstStickers.current, charm: null, cseed: null, cx: null, cz: null, cpx: null, cpy: null, cpz: null, cst: null, swear: null, ap: null,
      ...resolved.params,
      float: (o.float ?? resolved.float)?.toFixed(4) ?? null,
      seed: o.seed ?? resolved.seed ?? null,
    })
    applyOptions({ ...o, float: undefined, seed: undefined })
    setSelection(resolved.selection)
    firstStickers.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, catalog, attachments, agents])

  return { target, setTarget, selection, error }
}

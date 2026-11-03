import { useCallback, useEffect, useRef } from 'react'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import type { Item } from '@/lib/data/items'
import { emit, type EmbedItemInfo } from '@/lib/embed'
import type { Selection } from '@/lib/selection'
import { agentPatchesToParam } from '@/lib/url-state'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'

export function useEmbedInfo(selection: Selection | null, item: Item | null, viewer: SkinViewer | null, state: ViewerStateApi): () => EmbedItemInfo | null {
  const stateRef = useRef(state)
  stateRef.current = state
  return useCallback((): EmbedItemInfo | null => selection && {
    kind: selection.kind,
    id: selection.kind === 'skin' ? `${selection.item}|${selection.kit}` : selection.id,
    floatMin: item?.floatMin,
    floatMax: item?.floatMax,
    canInspect: !!viewer?.canInspect,
    canInspectGloves: !!viewer?.canInspectGloves || item?.style === 'glove',
    ...(selection.kind === 'sticker' && { stickerWear: stateRef.current.stickerWear }),
    ...(selection.kind === 'charm' && { charmPattern: stateRef.current.charm.seed }),
    ...(selection.kind === 'pet' && { petColor: stateRef.current.petVariant, petAnimation: stateRef.current.petClip ?? '' }),
    ...(selection.kind === 'agent' && { agentPatches: agentPatchesToParam(stateRef.current.agentPatches) }),
  }, [selection, item, viewer])
}

export function useEmbedStatusEvents(selection: Selection | null, status: string, loadError: string, catalogError: string, info: () => EmbedItemInfo | null): void {
  const awaitingLoad = useRef(false)
  useEffect(() => { awaitingLoad.current = true }, [selection])

  useEffect(() => {
    if (!selection) return
    if (status === 'loading') {
      awaitingLoad.current = false
      emit({ type: 'cs3d:loading' })
    } else if (awaitingLoad.current) return
    else if (status === 'ready') emit({ type: 'cs3d:loaded', item: info()! })
    else if (status === 'error') emit({ type: 'cs3d:error', message: loadError })
  }, [status, selection, loadError, info])

  useEffect(() => {
    if (catalogError) emit({ type: 'cs3d:error', message: catalogError })
  }, [catalogError])
}

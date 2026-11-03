import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import type { ViewOptions } from '@/hooks/use-viewer-sync'
import { asCommand, buildEmbedState, emit, EMBED_VERSION, replier, type EmbedItemInfo, type EmbedOptions, type EmbedTarget } from '@/lib/embed'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'
import type { Lighting, Viewmodel } from '@/lib/viewer/viewer-options'
import { watermarkScreenshot } from '@/lib/watermark'

interface Context {
  viewer: SkinViewer | null
  state: ViewerStateApi
  lighting: Lighting
  viewmodel: Viewmodel
  view: ViewOptions
  applyOptions: (options: EmbedOptions) => void
  info: () => EmbedItemInfo | null
  shareUrl: () => string | null
  openShare: () => void
  pendingOptions: MutableRefObject<EmbedOptions>
  setTarget: (target: EmbedTarget) => void
  setView: Dispatch<SetStateAction<ViewOptions>>
}

const png = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))

export function useEmbedCommands(context: Context): void {
  const latest = useRef(context)
  latest.current = context

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const command = asCommand(e.data)
      if (!command) return
      const { viewer, state, lighting, viewmodel, view, applyOptions, info, shareUrl, openShare, pendingOptions, setTarget, setView } = latest.current
      const reply = replier(e)
      switch (command.type) {
        case 'cs3d:load':
          pendingOptions.current = command.options ?? {}
          setTarget({ ...command.target })
          break
        case 'cs3d:set':
          applyOptions(command.options ?? {})
          break
        case 'cs3d:setMap':
          applyOptions({ map: command.map })
          break
        case 'cs3d:inspect':
          viewer?.inspect()
          break
        case 'cs3d:inspectGloves':
          if (viewer?.canInspectGloves) viewer.inspectGloves()
          else void viewer?.lookAtGloves(state.agent ?? undefined)
          break
        case 'cs3d:resetView':
          viewer?.resetView()
          setView((v) => ({ ...v, back: false }))
          break
        case 'cs3d:screenshot': {
          const dataUrl = viewer?.screenshot()
          if (dataUrl) void watermarkScreenshot(dataUrl).then((marked) => reply({ type: 'cs3d:screenshot', id: command.id, dataUrl: marked }))
          break
        }
        case 'cs3d:screenshots': {
          if (!viewer) break
          const { front, back } = viewer.renderSides(command.longSide ?? 2400)
          void Promise.all([png(front), png(back)]).then(([frontBlob, backBlob]) => {
            if (frontBlob && backBlob) reply({ type: 'cs3d:screenshots', id: command.id, front: frontBlob, back: backBlob })
          })
          break
        }
        case 'cs3d:openShare':
          openShare()
          break
        case 'cs3d:share': {
          const url = shareUrl()
          if (url) reply({ type: 'cs3d:share', id: command.id, url })
          break
        }
        case 'cs3d:getState':
          reply({ type: 'cs3d:state', id: command.id, state: buildEmbedState({ item: info(), shareUrl: shareUrl(), state, lighting, viewmodel, view }) })
          break
      }
    }
    window.addEventListener('message', onMessage)
    emit({ type: 'cs3d:ready', version: EMBED_VERSION })
    return () => window.removeEventListener('message', onMessage)
  }, [])
}

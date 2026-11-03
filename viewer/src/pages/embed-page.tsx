import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmbedBadge } from '@/components/embed/embed-badge'
import { EmbedStatus } from '@/components/embed/embed-status'
import { FrozenFrame } from '@/components/embed/frozen-frame'
import { ShareDialog } from '@/components/stage/share-button'
import { StudioBackdrop } from '@/components/stage/studio-backdrop'
import { useDbImages } from '@/context/db-context'
import { useCatalog } from '@/hooks/use-catalog'
import { useEmbedCommands } from '@/hooks/use-embed-commands'
import { useEmbedFreeze } from '@/hooks/use-embed-freeze'
import { useEmbedOptions } from '@/hooks/use-embed-options'
import { useEmbedInfo, useEmbedStatusEvents } from '@/hooks/use-embed-status'
import { useEmbedTarget } from '@/hooks/use-embed-target'
import { useEmbedViewerSetup } from '@/hooks/use-embed-viewer-setup'
import { useInspectActions } from '@/hooks/use-inspect-actions'
import { useShare } from '@/hooks/use-share'
import { useSkinLoader } from '@/hooks/use-skin-loader'
import { useViewer } from '@/hooks/use-viewer'
import { useViewerState } from '@/hooks/use-viewer-state'
import { useViewerSync, type ViewOptions } from '@/hooks/use-viewer-sync'
import { DEFAULT_FLOAT } from '@/lib/config'
import { parseEmbedParams, type EmbedOptions } from '@/lib/embed'
import { headingFor } from '@/lib/heading'
import type { ShareSource } from '@/lib/share-card'
import { DEFAULT_LIGHTING, DEFAULT_VIEWMODEL, type Lighting, type Viewmodel } from '@/lib/viewer/viewer-options'
import { clampFloat } from '@/lib/wear'

const HOME = 'https://chainskins.net'

export function EmbedPage() {
  const [initialParams] = useSearchParams()
  const [initial] = useState(() => parseEmbedParams(initialParams))
  const viewportRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const pendingOptions = useRef<EmbedOptions>(initial.options)
  const { catalog, attachments, agents, error: catalogError } = useCatalog()
  const state = useViewerState(false)
  const viewer = useViewer(viewportRef, !initial.lite)
  const [lighting, setLighting] = useState<Lighting>({ ...DEFAULT_LIGHTING, map: initial.options.map && initial.options.map !== 'studio' ? initial.options.map : null })
  const [viewmodel, setViewmodel] = useState<Viewmodel>({ ...DEFAULT_VIEWMODEL, leftHanded: false })
  const [view, setView] = useState<ViewOptions>({ spin: false, palmUp: false, knifePose: initial.options.knife_pose ?? 'tilted', back: initial.options.side === 'back' })
  const [shareOpen, setShareOpen] = useState<ShareSource | null>(null)

  const applyOptions = useEmbedOptions(state, { setLighting, setViewmodel, setView })
  const { target, setTarget, selection, error: targetError } = useEmbedTarget({
    initialTarget: initial.target, initialStickers: initial.stickers, pendingOptions, catalog, attachments, agents, state, applyOptions,
  })

  const shown = selection ?? { kind: 'sticker' as const, id: '' }
  const activeViewer = selection ? viewer : null
  const { item, weapon: heldWeapon, status, error: loadError } = useSkinLoader(activeViewer, shown, state)
  useViewerSync(activeViewer, shown, item, status, state, view)
  useInspectActions(activeViewer, shown, item, status, state.firstPerson, state.agent)
  useEmbedViewerSetup(viewer, mainRef, initial)
  const { frozen, thawing } = useEmbedFreeze(viewer, status, [selection, state.firstPerson, state.gloves, state.agent, state.loadout.weapon])

  const { weaponSeed, weaponFloat } = state.loadout
  useEffect(() => {
    if (selection?.kind !== 'agent' || !heldWeapon || status !== 'ready') return
    viewer?.setAgentWeapon(weaponSeed, clampFloat(heldWeapon, weaponFloat ?? DEFAULT_FLOAT))
  }, [viewer, selection, heldWeapon, status, weaponSeed, weaponFloat])
  useEffect(() => { viewer?.setLighting(lighting) }, [viewer, lighting])
  useEffect(() => { viewer?.setViewmodel(viewmodel) }, [viewer, viewmodel])

  const skin = useMemo(() => (shown.kind === 'skin' ? catalog?.skins.find((s) => s.item === shown.item && s.kit === shown.kit) : undefined), [catalog, shown])
  const images = useDbImages()
  const heading = headingFor(shown, item, skin, attachments, catalog, images, agents)
  const getShare = useShare({ viewer, selection: shown, state, heading, item, skin, catalog, attachments, agents, images })
  const shareUrl = () => (selection ? getShare().link.url : null)
  const openShare = () => { if (selection) setShareOpen(getShare()) }

  const info = useEmbedInfo(selection, item, viewer, state)
  useEmbedStatusEvents(selection, status, loadError, catalogError, info)
  useEmbedCommands({ viewer, state, lighting, viewmodel, view, applyOptions, info, shareUrl, openShare, pendingOptions, setTarget, setView })

  const error = targetError || loadError || catalogError
  const loading = !error && (!selection || status === 'loading')
  return (
    <main ref={mainRef} className={initial.transparent ? 'relative h-dvh w-full overflow-hidden' : 'relative h-dvh w-full overflow-hidden bg-background'}>
      {!initial.transparent && !lighting.map && <StudioBackdrop />}
      <div ref={viewportRef} className="absolute inset-0" />
      {frozen && <FrozenFrame canvas={frozen} thawing={thawing} />}
      <EmbedBadge href={(selection && shareUrl()) || HOME} />
      {initial.ui && <EmbedStatus loading={loading && !!target} error={error} />}
      <ShareDialog share={shareOpen} onClose={() => setShareOpen(null)} />
    </main>
  )
}

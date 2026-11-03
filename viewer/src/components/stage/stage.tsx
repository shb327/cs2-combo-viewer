import { Maximize2, Minimize2 } from 'lucide-react'
import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/common/callout'
import { SegmentedControl } from '@/components/common/segmented-control'
import { Spinner } from '@/components/common/spinner'
import { EditButton } from '@/components/stage/edit-button'
import { PillSwitch } from '@/components/stage/pill-switch'
import { MapPicker } from '@/components/stage/map-picker'
import { SettingsButton, type RenderStatus } from '@/components/stage/settings-button'
import { ShareButton } from '@/components/stage/share-button'
import { StageHeading } from '@/components/stage/stage-heading'
import { StageToolbar, type StageToolbarProps } from '@/components/stage/stage-toolbar'
import { StudioBackdrop } from '@/components/stage/studio-backdrop'
import { IS_MOBILE_DEVICE } from '@/lib/device'
import type { Heading } from '@/lib/heading'
import type { ShareSource } from '@/lib/share-card'
import type { KnifePose, MapLighting, RenderQuality } from '@/lib/viewer/skin-viewer'

interface StageProps extends StageToolbarProps {
  viewportRef: RefObject<HTMLDivElement | null>
  heading: Heading
  loading: boolean
  error: string
  /** The map around the model (null: the studio). */
  map: string | null
  onMap: (map: string | null) => void
  /** The view's link, card and render, for the share button. */
  getShare: () => ShareSource
  /** Edit mode (dragging stickers and the charm): whether it applies to this view, and whether it's on. */
  canEdit: boolean
  editing: boolean
  onToggleEditing: () => void
  /** Display settings (resolution, antialiasing, map effects) and what it draws at now. */
  quality: RenderQuality
  onQuality: (changes: Partial<RenderQuality>) => void
  mapLighting: MapLighting
  onMapLighting: (changes: Partial<MapLighting>) => void
  readRenderStatus: () => RenderStatus | null
  /** Gloves on a map: lit by the game's inspect rig or the studio (null: not offered). */
  gloveGameLight: boolean | null
  onGloveGameLight: (on: boolean) => void
  /** Front: the initial view; Back: a half turn around the model. */
  showingBack: boolean
  onSide: (back: boolean) => void
  /** Knives only (null: not a knife): how it stands. */
  knifePose: KnifePose | null
  onKnifePose: (pose: KnifePose) => void
  /** Everything but the viewport and its own button hidden (clean view, screenshots). */
  hideUi: boolean
  onToggleUi: () => void
}

/** The 3D viewport with the title, the edit, map, share and settings buttons (and the gloves' light switch), the floating toolbar and read-out, and the loading and error states over it. */
export function Stage({ viewportRef, heading, loading, error, map, onMap, getShare, canEdit, editing, onToggleEditing, quality, onQuality, mapLighting, onMapLighting, readRenderStatus, gloveGameLight, onGloveGameLight, showingBack, onSide, knifePose, onKnifePose, hideUi, onToggleUi, ...toolbar }: StageProps) {
  /** The view switches (Front/Back, a knife's pose): a column under the map on desktop, a compact row above the toolbar on phones. */
  const viewSwitches = (size: 'lg' | 'sm') => (
    <>
      <PillSwitch
        label="Front / Back"
        className={size === 'lg' ? 'w-36' : 'h-9 w-28 text-[10px]'}
        options={[{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]}
        value={showingBack ? 'back' : 'front'}
        onChange={(v) => onSide(v === 'back')}
      />
      {knifePose && (
        <PillSwitch
          label="Knife pose"
          className={size === 'lg' ? 'w-56' : 'h-9 w-48 text-[10px]'}
          options={[{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Flat' }, { value: 'tilted', label: 'Tilted' }]}
          value={knifePose}
          onChange={onKnifePose}
        />
      )}
    </>
  )

  return (
    <main className="relative order-1 min-h-[62dvh] flex-1 overflow-hidden border-white/10 lg:order-2 lg:min-h-0">
      <StudioBackdrop />
      <div ref={viewportRef} className="absolute inset-0" />
      {!hideUi && <StageHeading heading={heading} />}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2 lg:right-5 lg:top-5">
        {!hideUi && (
          <>
            {canEdit && <EditButton editing={editing} onToggle={onToggleEditing} />}
            {!IS_MOBILE_DEVICE && <MapPicker map={map} onChange={onMap} />}
            <div className="hidden flex-col items-end gap-2 lg:flex">{viewSwitches('lg')}</div>
            <ShareButton getShare={getShare} />
            <SettingsButton quality={quality} onChange={onQuality} mapLighting={mapLighting} onMapLighting={onMapLighting} readStatus={readRenderStatus} />
            {gloveGameLight !== null && (
              <div role="group" aria-label="Light on the gloves" title="The light the gloves have on a map: the studio's or the game's inspect rig">
                <SegmentedControl
                  className="glass-panel pointer-events-auto w-56 rounded-2xl p-1"
                  options={[{ value: 'studio', label: 'Studio light' }, { value: 'game', label: 'Game light' }]}
                  value={gloveGameLight ? 'game' : 'studio'}
                  onChange={(v) => onGloveGameLight(v === 'game')}
                />
              </div>
            )}
          </>
        )}
        <Button variant="outline" className="glass-panel pointer-events-auto size-10 rounded-2xl" aria-label={hideUi ? 'Show UI' : 'Hide UI'} title={hideUi ? 'Show UI (H)' : 'Hide UI (H)'} aria-pressed={hideUi} onClick={onToggleUi}>
          {hideUi ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 lg:p-5">
        {error && <Callout tone="error" pill className="pointer-events-auto">{error}</Callout>}
        {!hideUi && canEdit && editing && (
          <div className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] text-foreground/85">
            <span className="size-1.5 animate-pulse rounded-full bg-violet-400" />
            Edit mode · drag a sticker or the charm · drag elsewhere to turn the view
          </div>
        )}
        {!hideUi && (
          <>
            <div className="pointer-events-none flex flex-wrap justify-center gap-2 lg:hidden">{viewSwitches('sm')}</div>
            <StageToolbar {...toolbar} />
          </>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="glass-strong flex items-center gap-3 rounded-2xl px-4 py-3">
            <Spinner />
            Loading {heading.title}…
          </div>
        </div>
      )}
    </main>
  )
}

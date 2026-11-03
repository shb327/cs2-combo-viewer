import { ChevronDown, LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { BrandMark } from '@/components/common/brand-mark'
import { AttachmentsSection } from '@/components/sidebar/attachments-section'
import { AgentPatchesSection } from '@/components/sidebar/agent-patches-section'
import { CharmPatternSection } from '@/components/sidebar/charm-pattern-section'
import { CurrentPick } from '@/components/sidebar/current-pick'
import { FloatSection } from '@/components/sidebar/float-section'
import { SidebarSkeleton } from '@/components/sidebar/sidebar-skeleton'
import { PetSection } from '@/components/sidebar/pet-section'
import { PatternSection } from '@/components/sidebar/pattern-section'
import { StickerCardSection, StickerWearSection } from '@/components/sidebar/sticker-wear-section'
import { FirstPersonSection } from '@/components/sidebar/first-person-section'
import { LightingSection } from '@/components/sidebar/lighting-section'
import { LoadoutSection } from '@/components/sidebar/loadout-section'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { PatchIndex } from '@/lib/data/patches'
import type { PetIndex } from '@/lib/data/pets'
import type { Item } from '@/lib/data/items'
import type { Heading } from '@/lib/heading'
import { isSlabCharm, markupFor } from '@/lib/markup'
import type { PickerTarget } from '@/lib/picker'
import type { Selection } from '@/lib/selection'
import { fadeForItem } from '@/lib/fade'
import { clampFloat } from '@/lib/wear'
import { DEFAULT_FLOAT } from '@/lib/config'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import type { Lighting, Viewmodel } from '@/lib/viewer/skin-viewer'

interface SidebarProps {
  lighting: Lighting
  lightingPreset: string | null
  onLighting: (changes: Partial<Lighting>) => void
  viewmodel: Viewmodel
  onViewmodel: (changes: Partial<Viewmodel>) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  selection: Selection
  heading: Heading
  item: Item | null
  attachments: AttachmentIndex | null
  patches: PatchIndex | null
  pets: PetIndex | null
  state: ViewerStateApi
  glovesName: string | null
  agentName: string | null
  /** On an agent's page: the loadout weapon it holds (loaded) and its name; opening it in first person. */
  loadoutWeapon: Item | null
  loadoutWeaponName: string | null
  onLoadoutFirstPerson: (() => void) | null
  activeSticker: number
  onActiveSticker: (index: number) => void
  onOpenPicker: (target: PickerTarget) => void
  loading: boolean
  /** On a phone the panel is hidden until the stage's button opens it. */
  sheetOpen: boolean
  onCloseSheet: () => void
}

/** The control panel, floating over the page: the selection, then the sections that apply to it. On wide screens it folds into a slim rail. */
export function Sidebar({ lighting, lightingPreset, onLighting, viewmodel, onViewmodel, collapsed, onToggleCollapsed, selection, heading, item, attachments, patches, pets, state, glovesName, agentName, loadoutWeapon, loadoutWeaponName, onLoadoutFirstPerson, activeSticker, onActiveSticker, onOpenPicker, loading, sheetOpen, onCloseSheet }: SidebarProps) {
  const isSkin = selection.kind === 'skin'
  /** On a phone the panel is a sheet over half the screen, opened by the stage's button. */
  /** On a phone a skin's sections are split into tabs, so the sheet stays short; wide screens show them all. */
  const [tab, setTab] = useState<'finish' | 'stickers' | 'view'>('finish')
  const only = (t: typeof tab) => cn('contents', isSkin && tab !== t && 'max-lg:hidden')
  const stickerName = (id: string | null) => (id ? attachments?.sticker.get(id)?.name ?? id : '')
  const charmId = selection.kind === 'charm' ? selection.id : state.charm.id
  const charmIsSlab = isSlabCharm(charmId ? attachments?.charm.get(charmId) : undefined)

  return (
    <aside
      className={cn(
        'glass-panel order-2 flex min-h-0 flex-col rounded-t-3xl transition-[width] duration-300 ease-out lg:order-1 lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-l-0 lg:shadow-none',
        collapsed ? 'lg:w-[68px]' : 'lg:w-[340px]',
        sheetOpen ? 'sheet-in max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:rounded-none max-lg:border-0' : 'max-lg:hidden',
      )}
    >
      <div className={cn('flex items-center gap-2 border-b border-white/10 px-3.5 py-2', collapsed && 'lg:flex-col lg:px-2.5 lg:py-2.5')}>
        <BrandMark compact={collapsed} className={cn('flex-1', collapsed && 'lg:flex-none')} />
        <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" aria-label={collapsed ? 'Expand panel' : 'Collapse panel'} onClick={onToggleCollapsed}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Close the panel" onClick={onCloseSheet}>
          <ChevronDown />
        </Button>
      </div>

      {collapsed && (
        <div className="hidden flex-col items-center gap-2.5 py-3 lg:flex">
          <Button variant="outline" size="icon-lg" aria-label="Change skin" title={heading.title} onClick={() => onOpenPicker({ kind: 'selection' })}>
            <LayoutGrid />
          </Button>
          <span className="mt-1 h-10 w-1.5 rounded-full" style={{ background: heading.color }} />
        </div>
      )}

      <div data-loading={loading} aria-busy={loading} className={cn('group/panel sheet-cards flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4', collapsed && 'lg:hidden')}>
        <CurrentPick over={heading.over} title={heading.title} color={heading.color} onClick={() => onOpenPicker({ kind: 'selection' })} />
        <div className="contents">

        {isSkin && item && (
          <div role="tablist" className="flex gap-1 rounded-2xl bg-white/[0.05] p-1 lg:hidden">
            {([['finish', 'Finish'], ['stickers', 'Stickers'], ['view', 'View']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={cn('flex-1 rounded-xl py-1.5 text-[12.5px] font-semibold transition-colors', tab === id ? 'bg-white/15 text-white' : 'text-muted-foreground')}>
                {label}
              </button>
            ))}
          </div>
        )}

        {isSkin && !item && <SidebarSkeleton />}

        {isSkin && item && (
          <>
            <div className={cn(only('finish'), tab === 'finish' && 'max-lg:flex max-lg:flex-col max-lg:gap-3.5')}>
              <FloatSection item={item} float={clampFloat(item, state.float ?? DEFAULT_FLOAT)} onChange={state.setFloat} />
              <PatternSection seed={state.seed} onChange={state.setSeed} fade={fadeForItem(item, state.seed)} />
            </div>
            <div className={only('stickers')}>
            <AttachmentsSection
              markup={markupFor(item)}
              attachments={attachments}
              stickers={state.stickers}
              activeSticker={activeSticker}
              charm={state.charm}
              onActiveSticker={onActiveSticker}
              onStickers={state.setStickers}
              onCharm={state.setCharm}
              onOpenPicker={onOpenPicker}
            />
            </div>
          </>
        )}

        {selection.kind === 'pet' && (
          <PetSection pet={pets?.pet.get(selection.id)} pets={pets} variant={state.petVariant} clip={state.petClip} onVariant={state.setPetVariant} onClip={state.setPetClip} />
        )}

        {selection.kind === 'sticker' && (
          <>
            <StickerWearSection wear={state.stickerWear} onChange={state.setStickerWear} />
            <StickerCardSection card={state.stickerCard} onCard={state.setStickerCard} />
          </>
        )}

        {selection.kind === 'charm' && (
          <CharmPatternSection
            charm={charmId ? attachments?.charm.get(charmId) : undefined}
            seed={state.charm.seed}
            isSlab={charmIsSlab}
            stickerId={state.charm.sticker}
            stickerName={stickerName(state.charm.sticker)}
            onSeed={(seed) => state.setCharm({ seed })}
            onChooseSticker={() => onOpenPicker({ kind: 'sticker', target: 'slab' })}
            onClearSticker={() => state.setCharm({ sticker: null })}
          />
        )}

        {isSkin && item && item.style !== 'glove' && state.firstPerson && (
          <div className={only('view')}>
          <FirstPersonSection
            agentName={agentName}
            glovesName={glovesName}
            viewmodel={viewmodel}
            onViewmodel={onViewmodel}
            onChooseAgent={() => onOpenPicker({ kind: 'agent' })}
            onDefaultAgent={() => state.setAgent(null)}
            onChooseGloves={() => onOpenPicker({ kind: 'gloves' })}
            onBareArms={() => state.setGloves(null)}
          />
          </div>
        )}

        {selection.kind === 'agent' && (
          <LoadoutSection
            weapon={loadoutWeapon}
            weaponName={loadoutWeaponName}
            weaponSeed={state.loadout.weaponSeed}
            weaponFloat={loadoutWeapon ? clampFloat(loadoutWeapon, state.loadout.weaponFloat ?? DEFAULT_FLOAT) : DEFAULT_FLOAT}
            glovesName={glovesName}
            viewmodel={viewmodel}
            onChooseWeapon={() => onOpenPicker({ kind: 'weapon' })}
            onNoWeapon={() => state.updateLoadout({ weapon: null })}
            onWeaponSeed={(weaponSeed) => state.updateLoadout({ weaponSeed })}
            onWeaponFloat={(weaponFloat) => state.updateLoadout({ weaponFloat })}
            onChooseGloves={() => onOpenPicker({ kind: 'gloves' })}
            onAgentGloves={() => state.setGloves(null)}
            onViewmodel={onViewmodel}
            onFirstPerson={onLoadoutFirstPerson}
          />
        )}

        {selection.kind === 'agent' && (
          <AgentPatchesSection worn={state.agentPatches} patches={patches} onChoose={(slot) => onOpenPicker({ kind: 'patch', slot })} onChange={state.setAgentPatch} />
        )}

        <div className={only('view')}><LightingSection lighting={lighting} presetId={lightingPreset} onChange={onLighting} /></div>
        </div>
      </div>
    </aside>
  )
}

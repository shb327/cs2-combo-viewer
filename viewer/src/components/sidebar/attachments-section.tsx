import { Section } from '@/components/common/section'
import { CharmEditor } from '@/components/sidebar/charm-editor'
import { StickerEditor } from '@/components/sidebar/sticker-editor'
import type { AttachmentIndex } from '@/lib/data/attachments'
import { isSlabCharm, type ItemMarkup } from '@/lib/markup'
import type { PickerTarget } from '@/lib/picker'
import type { CharmState } from '@/hooks/use-viewer-state'
import type { StickerOptions } from '@/lib/viewer/skin-viewer'

interface AttachmentsSectionProps {
  markup: ItemMarkup | undefined
  attachments: AttachmentIndex | null
  stickers: StickerOptions[]
  activeSticker: number
  charm: CharmState
  onActiveSticker: (index: number) => void
  onStickers: (list: StickerOptions[]) => void
  onCharm: (changes: Partial<CharmState>) => void
  onOpenPicker: (target: PickerTarget) => void
}

/** Stickers and the charm of the shown weapon. */
export function AttachmentsSection({ markup, attachments, stickers, activeSticker, charm, onActiveSticker, onStickers, onCharm, onOpenPicker }: AttachmentsSectionProps) {
  const stickerName = (id: string | null) => (id ? attachments?.sticker.get(id)?.name ?? id : '')
  const charmDef = charm.id ? attachments?.charm.get(charm.id) : undefined
  const active = Math.min(activeSticker, stickers.length - 1)

  return (
    <Section title="Attachments" collapsible={{ id: 'attachments' }}>
      {markup ? (
        <div className="flex flex-col gap-4">
          <StickerEditor
            stickers={stickers}
            active={active}
            slotCount={Math.max(1, markup.stickerSlots.length)}
            stickerName={stickerName}
            onActive={onActiveSticker}
            onChange={(index, patch) => onStickers(stickers.map((s, k) => (k === index ? { ...s, ...patch } : s)))}
            onRemove={(index) => onStickers(stickers.filter((_, k) => k !== index))}
            onReplace={(index) => onOpenPicker({ kind: 'sticker', target: index })}
            onAdd={() => onOpenPicker({ kind: 'sticker', target: 'add' })}
          />
          <CharmEditor
            charm={charm}
            hasCharmPoint={markup.charm}
            isSlab={isSlabCharm(charmDef)}
            charmDef={charmDef}
            charmName={charmDef?.name ?? charm.id ?? ''}
            stickerName={stickerName(charm.sticker)}
            onChange={onCharm}
            onChoose={() => onOpenPicker({ kind: 'charm' })}
            onChooseSticker={() => onOpenPicker({ kind: 'sticker', target: 'slab' })}
          />
        </div>
      ) : (
        <div className="text-[12px] text-muted-foreground">No sticker slots or charm point on this item.</div>
      )}
    </Section>
  )
}

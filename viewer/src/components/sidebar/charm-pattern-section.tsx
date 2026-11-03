import { PickerField } from '@/components/common/picker-field'
import { Section } from '@/components/common/section'
import { CharmSeedControl } from '@/components/common/charm-seed-control'
import type { CharmDef } from '@/lib/data/attachments'

interface CharmPatternSectionProps {
  charm: CharmDef | undefined
  seed: number
  isSlab: boolean
  stickerId: string | null
  stickerName: string
  onSeed: (seed: number) => void
  onChooseSticker: () => void
  onClearSticker: () => void
}

/** The pattern of a charm shown on its own (and the sticker of a sticker slab). */
export function CharmPatternSection({ charm, seed, isSlab, stickerId, stickerName, onSeed, onChooseSticker, onClearSticker }: CharmPatternSectionProps) {
  return (
    <Section title="Charm pattern" collapsible={{ id: 'charm-pattern' }} aside={<span className="font-mono text-[12px] tabular-nums">#{seed}</span>}>
      <CharmSeedControl charm={charm} seed={seed} onChange={onSeed} />
      {isSlab && (
        <div className="mt-3">
          <PickerField label="Sticker" value={stickerId ? stickerName : null} clearLabel="Remove slab sticker" onChoose={onChooseSticker} onClear={onClearSticker} />
        </div>
      )}
    </Section>
  )
}

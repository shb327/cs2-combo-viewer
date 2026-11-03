import { BadgeCheck, KeyRound, Sticker } from 'lucide-react'
import { Callout } from '@/components/common/callout'
import { Section } from '@/components/common/section'
import { AttachmentRow } from '@/components/inspect/attachment-row'
import { PATCH_GLOW, STICKER_GLOW } from '@/components/inspect/glows'
import { PatternWell } from '@/components/inspect/pattern-well'
import { SkinDetails } from '@/components/inspect/skin-details'
import { ItemHeader } from '@/components/inspect/item-header'
import type { InspectPreview } from '@/lib/inspect-preview'


/**
 * Everything an inspect link says about its item: the market card, then — for a skin — float, pattern, stickers
 * and charm; for an agent its patches; for a charm item its pattern and the sticker in a slab (a sticker item is
 * just its card).
 */
export function ItemPreview({ preview }: { preview: InspectPreview }) {
  return (
    <div className="flex flex-col gap-3">
      <ItemHeader preview={preview} />
      {preview.kind === 'skin' && <SkinDetails preview={preview} />}
      {preview.kind === 'agent' && preview.stickers.length > 0 && (
        <Section title="Patches" icon={BadgeCheck} aside={<span className="text-[11px] tabular-nums text-muted-foreground">{preview.stickers.length}</span>}>
          <div className="flex flex-col gap-1.5">
            {preview.stickers.map((p, i) => (
              <AttachmentRow key={i} name={p.name} image={p.image} color={PATCH_GLOW} icon={BadgeCheck} detail={`Slot ${p.slot + 1}`} known={p.known} />
            ))}
          </div>
        </Section>
      )}
      {preview.kind === 'charm' && preview.charm && (
        <Section title="Pattern" icon={KeyRound}>
          <div className="flex items-center gap-3">
            <PatternWell value={preview.charm.pattern} />
            {preview.charm.slabSticker && (
              <div className="min-w-0 flex-1">
                <AttachmentRow
                  name={preview.charm.slabSticker.name}
                  image={preview.charm.slabSticker.image}
                  color={STICKER_GLOW}
                  icon={Sticker}
                  detail="In the slab"
                  known={preview.charm.slabSticker.known}
                />
              </div>
            )}
          </div>
        </Section>
      )}
      {preview.problem && <Callout tone="warning">The viewer can’t show this item yet: {preview.problem}</Callout>}
    </div>
  )
}

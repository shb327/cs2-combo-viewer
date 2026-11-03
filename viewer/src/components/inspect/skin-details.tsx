import { Gauge, KeyRound, Link2, Sticker } from 'lucide-react'
import { Section } from '@/components/common/section'
import { AttachmentRow } from '@/components/inspect/attachment-row'
import { FloatBar } from '@/components/inspect/float-bar'
import { CHARM_GLOW, STICKER_GLOW } from '@/components/inspect/glows'
import { PatternWell } from '@/components/inspect/pattern-well'
import { StickerWear } from '@/components/inspect/sticker-wear'
import type { InspectPreview } from '@/lib/inspect-preview'

/** A skin's float, pattern, stickers and charm. */
export function SkinDetails({ preview }: { preview: InspectPreview }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Section title="Float" icon={Gauge}>
          <FloatBar float={preview.float} wear={preview.wear} min={preview.floatMin} max={preview.floatMax} />
        </Section>
        <Section title="Pattern" icon={KeyRound}>
          <PatternWell value={preview.seed} />
        </Section>
      </div>

      {preview.stickers.length > 0 && (
        <Section title="Stickers" icon={Sticker} aside={<span className="text-[11px] tabular-nums text-muted-foreground">{preview.stickers.length}</span>}>
          <div className="flex flex-col gap-1.5">
            {preview.stickers.map((s, i) => (
              <AttachmentRow
                key={i}
                name={s.name}
                image={s.image}
                color={STICKER_GLOW}
                icon={Sticker}
                detail={`Slot ${s.slot + 1}${s.known ? '' : ' · not in the viewer'}`}
                known={s.known}
                aside={<StickerWear wear={s.wear} />}
              />
            ))}
          </div>
        </Section>
      )}

      {preview.charm && (
        <Section title="Charm" icon={Link2}>
          <AttachmentRow
            name={preview.charm.name}
            image={preview.charm.image}
            color={CHARM_GLOW}
            icon={Link2}
            known={preview.charm.known}
            aside={<span className="font-mono text-[12px] tabular-nums text-muted-foreground">#{preview.charm.pattern}</span>}
          />
        </Section>
      )}
    </>
  )
}

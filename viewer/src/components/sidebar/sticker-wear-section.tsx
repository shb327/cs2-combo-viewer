import { LabeledSlider } from '@/components/common/labeled-slider'
import { Section } from '@/components/common/section'
import { SwitchField } from '@/components/common/switch-field'
import { Button } from '@/components/ui/button'

interface StickerWearSectionProps {
  wear: number
  onChange: (wear: number) => void
}

const PRESETS = [0, 0.25, 0.5, 0.8]

/** The wear of a sticker shown on its own. */
export function StickerWearSection({ wear, onChange }: StickerWearSectionProps) {
  return (
    <Section title="Sticker wear" collapsible={{ id: 'sticker-wear' }} aside={<span className="font-mono text-[12px] tabular-nums">{(wear * 100).toFixed(0)}%</span>}>
      <LabeledSlider label="Wear" value={wear} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={onChange} />
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {PRESETS.map((w) => (
          <Button key={w} variant={wear === w ? 'default' : 'outline'} size="sm" onClick={() => onChange(w)}>{w === 0 ? 'Pristine' : w * 100 + '%'}</Button>
        ))}
      </div>
    </Section>
  )
}

/** A sticker shown on its own can sit on the game's inspect card (the grey card with the CS2 mark). */
export function StickerCardSection({ card, onCard }: { card: boolean; onCard: (on: boolean) => void }) {
  return (
    <Section title="Card" collapsible={{ id: 'sticker-card' }}>
      <SwitchField checked={card} label="Show on the inspect card" onChange={onCard} />
    </Section>
  )
}

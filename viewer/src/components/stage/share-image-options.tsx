import { FieldGroup } from '@/components/common/field-group'
import { LabeledSlider } from '@/components/common/labeled-slider'
import { SegmentedControl } from '@/components/common/segmented-control'
import { SwitchField } from '@/components/common/switch-field'
import { CARD_ASPECTS, CARD_BACKGROUNDS, CARD_FORMATS, CARD_QUALITIES, type CardStyle } from '@/lib/share-image'
import { cn } from '@/lib/utils'

interface ShareImageOptionsProps {
  style: CardStyle
  /** The item's rarity color (the Rarity background's swatch). */
  rarityColor: string
  onChange: (changes: Partial<CardStyle>) => void
}

const swatch = (id: string, style: CardStyle, rarityColor: string) => {
  if (id === 'transparent') return 'repeating-conic-gradient(#3f3f46 0 25%, #18181b 0 50%) 50% / 12px 12px'
  if (id === 'custom') return `linear-gradient(${style.angle + 90}deg, ${style.from}, ${style.to})`
  if (id === 'rarity') return `linear-gradient(135deg, #0b0b12, ${rarityColor})`
  const b = CARD_BACKGROUNDS.find((x) => x.id === id)!
  return `linear-gradient(135deg, ${b.from}, ${b.to})`
}

/** The share image's options: background (presets, custom gradient, none), shape, resolution, file type, what shows. */
export function ShareImageOptions({ style, rarityColor, onChange }: ShareImageOptionsProps) {
  const show = (key: keyof CardStyle['show'], on: boolean) => onChange({ show: { ...style.show, [key]: on } })
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup label="Background">
        <div className="grid grid-cols-5 gap-1.5">
          {CARD_BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              title={b.label}
              aria-pressed={style.background === b.id}
              onClick={() => onChange({ background: b.id, ...(b.id === 'transparent' && style.format === 'jpeg' ? { format: 'png' as const } : {}) })}
              className={cn('flex flex-col items-center gap-1 rounded-xl p-1 text-[10px] font-medium', style.background === b.id ? 'bevel-primary text-white' : 'bevel text-foreground/75')}
            >
              <span className="h-7 w-full rounded-lg ring-1 ring-black/40" style={{ background: swatch(b.id, style, rarityColor) }} />
              {b.label}
            </button>
          ))}
        </div>
        {style.background === 'custom' && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex gap-3">
              {(['from', 'to'] as const).map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-[11px] text-foreground/80">
                  <input type="color" value={style[key]} onChange={(e) => onChange({ [key]: e.target.value })} className="size-7 cursor-pointer rounded-md border border-white/15 bg-transparent p-0" />
                  {key === 'from' ? 'From' : 'To'}
                </label>
              ))}
            </div>
            <LabeledSlider label="Angle" value={style.angle} min={0} max={360} step={1} format={(v) => `${Math.round(v)}°`} onChange={(angle) => onChange({ angle })} />
          </div>
        )}
      </FieldGroup>

      <FieldGroup label="Shape">
        <SegmentedControl options={CARD_ASPECTS.map((a) => ({ value: a, label: a }))} value={style.aspect} onChange={(aspect) => onChange({ aspect })} />
      </FieldGroup>
      <FieldGroup label="Quality">
        <SegmentedControl options={CARD_QUALITIES} value={style.quality} onChange={(quality) => onChange({ quality })} />
      </FieldGroup>
      <FieldGroup label="Format">
        <SegmentedControl
          options={CARD_FORMATS.filter((f) => f.value !== 'jpeg' || style.background !== 'transparent')}
          value={style.format}
          onChange={(format) => onChange({ format })}
        />
      </FieldGroup>

      <div className="flex flex-col gap-2.5">
        <SwitchField checked={style.show.details} label="Float, wear and pattern" onChange={(on) => show('details', on)} />
        <SwitchField checked={style.show.attachments} label="Stickers and charm" onChange={(on) => show('attachments', on)} />
        <SwitchField checked={style.show.qr} label="QR code of the link" onChange={(on) => show('qr', on)} />
      </div>
    </div>
  )
}

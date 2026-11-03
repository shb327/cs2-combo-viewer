import { Dices } from 'lucide-react'
import { ColorBarSlider } from '@/components/common/color-bar-slider'
import { DraftSlider } from '@/components/common/draft-slider'
import { NumberField } from '@/components/common/number-field'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SeedControlProps {
  /** Names the slider, the field ("… value") and the dice ("Random …"). */
  label: string
  value: number
  min: number
  max: number
  /** A color bar for the track (for example a charm's pattern colors); a plain slider without it. */
  background?: string
  fieldClassName?: string
  onChange: (value: number) => void
}

/** A pattern / seed: a slider, the value to type in, and a random button. Values are whole numbers within min–max. */
export function SeedControl({ label, value, min, max, background, fieldClassName, onChange }: SeedControlProps) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v) || min)))
  return (
    <div className="flex items-center gap-3">
      {background
        ? <ColorBarSlider label={label} value={value} min={min} max={max} step={1} background={background} onChange={set} />
        : <DraftSlider label={label} value={value} min={min} max={max} step={1} onChange={set} />}
      <NumberField label={`${label} value`} value={value} min={min} max={max} className={cn('w-16 shrink-0', fieldClassName)} onChange={set} />
      <Button variant="outline" size="icon" aria-label={`Random ${label.toLowerCase()}`} onClick={() => set(min + Math.floor(Math.random() * (max - min + 1)))}><Dices /></Button>
    </div>
  )
}

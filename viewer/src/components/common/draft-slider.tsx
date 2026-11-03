import { Slider } from '@/components/ui/slider'
import { useSliderDraft } from '@/hooks/use-slider-draft'
import { cn } from '@/lib/utils'

interface DraftSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** Shows the value on the right, following the thumb while dragging. */
  format?: (value: number) => string
  className?: string
  onChange: (value: number) => void
}

/** A single-thumb slider that follows the pointer on its own and pushes its value out at a pace the app can take (useSliderDraft). */
export function DraftSlider({ label, value, min, max, step, format, className, onChange }: DraftSliderProps) {
  const slider = useSliderDraft(value, onChange)
  return (
    <>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[slider.value]}
        onValueChange={slider.onValueChange}
        onValueCommitted={slider.onValueCommitted}
        className={cn('min-w-0 flex-1', className)}
      />
      {format && <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground/80">{format(slider.value)}</span>}
    </>
  )
}

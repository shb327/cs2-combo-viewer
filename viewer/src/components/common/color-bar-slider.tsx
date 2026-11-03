import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { useSliderDraft } from '@/hooks/use-slider-draft'
import { cn } from '@/lib/utils'

interface ColorBarSliderProps {
  value: number
  min: number
  max: number
  step: number
  background: string
  label: string
  className?: string
  onChange: (value: number) => void
}

/** A slider whose track is a color bar (for example the wear bands), with a white round thumb. */
export function ColorBarSlider({ value, min, max, step, background, label, className, onChange }: ColorBarSliderProps) {
  const slider = useSliderDraft(value, onChange)
  return (
    <SliderPrimitive.Root
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={[slider.value]}
      onValueChange={slider.onValueChange}
      onValueCommitted={slider.onValueCommitted}
      thumbAlignment="edge"
      className={cn('w-full', className)}
    >
      <SliderPrimitive.Control className="flex h-6 w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="relative h-2.5 w-full rounded-full shadow-[inset_0_1px_2px_oklch(0_0_0/40%)]" style={{ background }}>
          <SliderPrimitive.Thumb className="block size-[18px] rounded-full border-2 border-white bg-white shadow-[0_2px_10px_oklch(0_0_0/60%),0_0_0_4px_oklch(1_0_0/14%)] outline-none transition-shadow hover:shadow-[0_2px_10px_oklch(0_0_0/60%),0_0_0_6px_oklch(1_0_0/20%)] focus-visible:ring-3 focus-visible:ring-ring/60" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

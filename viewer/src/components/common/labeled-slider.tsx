import { DraftSlider } from '@/components/common/draft-slider'
import { FieldRow } from '@/components/common/field-row'

interface LabeledSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}

/** A slider with its label on the left and the formatted value on the right. */
export function LabeledSlider({ label, ...slider }: LabeledSliderProps) {
  return (
    <FieldRow label={label}>
      <DraftSlider label={label} {...slider} />
    </FieldRow>
  )
}

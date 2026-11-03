import { Section } from '@/components/common/section'
import { SeedControl } from '@/components/common/seed-control'
import { SEED_MAX } from '@/lib/config'
import { FadeMeter } from '@/components/common/fade-meter'
import type { FadeResult } from '@/lib/fade'

interface PatternSectionProps {
  seed: number
  onChange: (seed: number) => void
  /** The skin's Fade percentage at this seed, when it is a Fade. */
  fade?: FadeResult | null
}

/** The pattern seed (1–1000): a slider, the value to type in, and a random button. */
export function PatternSection({ seed, onChange, fade }: PatternSectionProps) {
  return (
    <Section title="Pattern" collapsible={{ id: 'pattern' }}>
      <SeedControl label="Pattern seed" value={seed} min={1} max={SEED_MAX} onChange={onChange} />
      {fade && <FadeMeter fade={fade} />}
    </Section>
  )
}

import { SeedControl } from '@/components/common/seed-control'
import { useCharmGradient } from '@/hooks/use-charm-gradient'
import { CHARM_PATTERN_MAX, type CharmDef } from '@/lib/data/attachments'

interface CharmSeedControlProps {
  charm: CharmDef | undefined
  seed: number
  onChange: (seed: number) => void
}

/** A charm's pattern (0–100000), its slider painted with the charm's colors along the pattern range. */
export function CharmSeedControl({ charm, seed, onChange }: CharmSeedControlProps) {
  const gradient = useCharmGradient(charm)
  return (
    <SeedControl
      label="Charm pattern"
      value={seed}
      min={0}
      max={CHARM_PATTERN_MAX}
      background={gradient ?? 'oklch(1 0 0 / 12%)'}
      fieldClassName="w-20"
      onChange={onChange}
    />
  )
}

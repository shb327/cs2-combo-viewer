import { Crosshair, Eye, Hand } from 'lucide-react'
import { ColorBarSlider } from '@/components/common/color-bar-slider'
import { FieldGroup } from '@/components/common/field-group'
import { LabeledSlider } from '@/components/common/labeled-slider'
import { NumberField } from '@/components/common/number-field'
import { PickerField } from '@/components/common/picker-field'
import { Section } from '@/components/common/section'
import { SeedControl } from '@/components/common/seed-control'
import { Button } from '@/components/ui/button'
import { SEED_MAX } from '@/lib/config'
import type { Item } from '@/lib/data/items'
import type { Viewmodel } from '@/lib/viewer/skin-viewer'
import { bandsGradient, clampSeed, wearOf } from '@/lib/wear'

interface LoadoutSectionProps {
  /** The weapon skin the agent holds (loaded), its name, pattern and float. */
  weapon: Item | null
  weaponName: string | null
  weaponSeed: number
  weaponFloat: number
  glovesName: string | null
  viewmodel: Viewmodel
  onChooseWeapon: () => void
  onNoWeapon: () => void
  onWeaponSeed: (seed: number) => void
  onWeaponFloat: (float: number) => void
  onChooseGloves: () => void
  onAgentGloves: () => void
  onViewmodel: (changes: Partial<Viewmodel>) => void
  /** Opens the weapon in first person with this agent and these gloves. */
  onFirstPerson: (() => void) | null
}

/**
 * An agent's loadout: the weapon skin it holds (with its pattern and float) and its gloves (with theirs). The same
 * loadout first person uses, kept across visits.
 */
export function LoadoutSection({
  weapon, weaponName, weaponSeed, weaponFloat, glovesName, viewmodel,
  onChooseWeapon, onNoWeapon, onWeaponSeed, onWeaponFloat, onChooseGloves, onAgentGloves, onViewmodel, onFirstPerson,
}: LoadoutSectionProps) {
  const wear = wearOf(weaponFloat)
  const gloveWear = wearOf(viewmodel.gloveFloat)
  return (
    <Section title="Loadout" collapsible={{ id: 'loadout', defaultOpen: true }}>
      <div className="flex flex-col gap-4">
        <FieldGroup label="Weapon">
          <PickerField value={weaponName} placeholder="Choose a weapon skin" icon={Crosshair} clearLabel="No weapon" onChoose={onChooseWeapon} onClear={onNoWeapon} />
          {weapon && (
            <>
              <div className="flex items-center gap-3">
                <ColorBarSlider label="Float" value={weaponFloat} min={weapon.floatMin} max={weapon.floatMax} step={0.0001} background={bandsGradient(weapon)} onChange={onWeaponFloat} />
                <NumberField label="Float value" value={weaponFloat} min={weapon.floatMin} max={weapon.floatMax} decimals={4} className="w-24 shrink-0" onChange={onWeaponFloat} />
              </div>
              <div className="-mt-1 text-[10.5px]" style={{ color: wear.color }}>{wear.name}</div>
              <SeedControl label="Pattern seed" value={weaponSeed} min={1} max={SEED_MAX} onChange={onWeaponSeed} />
            </>
          )}
        </FieldGroup>

        <FieldGroup label="Gloves">
          <PickerField value={glovesName} placeholder="Agent's gloves" icon={Hand} clearLabel="Agent's gloves" onChoose={onChooseGloves} onClear={onAgentGloves} />
          {glovesName && (
            <>
              <LabeledSlider label="Float" value={viewmodel.gloveFloat} min={0} max={1} step={0.001} format={(v) => v.toFixed(3)} onChange={(gloveFloat) => onViewmodel({ gloveFloat })} />
              <div className="-mt-1 pl-[66px] text-[10.5px]" style={{ color: gloveWear.color }}>{gloveWear.name}</div>
              <LabeledSlider
                label="Pattern"
                value={viewmodel.gloveSeed ?? 1}
                min={1}
                max={SEED_MAX}
                step={1}
                format={(v) => (viewmodel.gloveSeed === null ? 'Own' : '#' + v)}
                onChange={(v) => onViewmodel({ gloveSeed: clampSeed(v) })}
              />
            </>
          )}
        </FieldGroup>

        {onFirstPerson && (
          <Button variant="outline" onClick={onFirstPerson}><Eye /> See in first person</Button>
        )}
      </div>
    </Section>
  )
}

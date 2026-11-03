import { BadgeCheck } from 'lucide-react'
import { FieldGroup } from '@/components/common/field-group'
import { LabeledSlider } from '@/components/common/labeled-slider'
import { PickerField } from '@/components/common/picker-field'
import { Section } from '@/components/common/section'
import type { PatchIndex } from '@/lib/data/patches'
import { PATCH_SLOTS } from '@/lib/url-state'
import type { AgentPatch } from '@/lib/viewer/agent-patches'

interface AgentPatchesSectionProps {
  /** The patch worn in each slot (null = empty). */
  worn: (AgentPatch | null)[]
  patches: PatchIndex | null
  onChoose: (slot: number) => void
  onChange: (slot: number, patch: AgentPatch | null) => void
}

/** An agent's patches: each of its slots takes a patch and its size, as the inspect link of an agent carries them. */
export function AgentPatchesSection({ worn, patches, onChoose, onChange }: AgentPatchesSectionProps) {
  const count = worn.filter(Boolean).length
  return (
    <Section title="Patches" collapsible={{ id: 'agent-patches', defaultOpen: true }} aside={<span className="text-[11px] tabular-nums text-muted-foreground">{count}/{PATCH_SLOTS}</span>}>
      <div className="flex flex-col gap-4">
        {Array.from({ length: PATCH_SLOTS }, (_, slot) => {
          const patch = worn[slot]
          return (
            <FieldGroup key={slot} label={`Slot ${slot + 1}`}>
              <PickerField
                value={patch ? patches?.patch.get(patch.id)?.name ?? patch.id : null}
                placeholder="Choose a patch"
                icon={BadgeCheck}
                clearLabel={`Remove the patch in slot ${slot + 1}`}
                onChoose={() => onChoose(slot)}
                onClear={() => onChange(slot, null)}
              />
              {patch && (
                <LabeledSlider label="Size" value={patch.scale} min={0.5} max={1.5} step={0.01} format={(v) => v.toFixed(2) + '×'} onChange={(scale) => onChange(slot, { ...patch, scale })} />
              )}
            </FieldGroup>
          )
        })}
      </div>
    </Section>
  )
}

import { Hand, RotateCcw, UserRound } from 'lucide-react'
import { FieldGroup } from '@/components/common/field-group'
import { LabeledSlider } from '@/components/common/labeled-slider'
import { PickerField } from '@/components/common/picker-field'
import { Section } from '@/components/common/section'
import { SwitchField } from '@/components/common/switch-field'
import { Button } from '@/components/ui/button'
import { SEED_MAX } from '@/lib/config'
import { DEFAULT_VIEWMODEL, type Viewmodel } from '@/lib/viewer/viewer-options'
import { clampSeed, wearOf } from '@/lib/wear'

interface FirstPersonSectionProps {
  /** The chosen agent's name, or null for the default agent. */
  agentName: string | null
  glovesName: string | null
  viewmodel: Viewmodel
  onViewmodel: (changes: Partial<Viewmodel>) => void
  onChooseAgent: () => void
  onDefaultAgent: () => void
  onChooseGloves: () => void
  onBareArms: () => void
}

/** First person: the agent (whose arms and sleeves), the gloves (which, their float and pattern) and the viewmodel (FOV, offsets, hand, sway). */
export function FirstPersonSection({ agentName, glovesName, viewmodel, onViewmodel, onChooseAgent, onDefaultAgent, onChooseGloves, onBareArms }: FirstPersonSectionProps) {
  const resetViewmodel = () => onViewmodel({
    fov: DEFAULT_VIEWMODEL.fov, offsetX: DEFAULT_VIEWMODEL.offsetX, offsetY: DEFAULT_VIEWMODEL.offsetY, offsetZ: DEFAULT_VIEWMODEL.offsetZ, leftHanded: false, sway: DEFAULT_VIEWMODEL.sway,
  })
  const gloveWear = wearOf(viewmodel.gloveFloat)

  return (
    <Section
      title="First person"
      collapsible={{ id: 'first-person', defaultOpen: true }}
      aside={<Button variant="ghost" size="icon-xs" aria-label="Reset viewmodel" title="Reset viewmodel" onClick={resetViewmodel}><RotateCcw /></Button>}
    >
      <div className="flex flex-col gap-4">
        <FieldGroup label="Agent">
          <PickerField value={agentName} placeholder="Default CT Agent" icon={UserRound} clearLabel="Default agent" onChoose={onChooseAgent} onClear={onDefaultAgent} />
        </FieldGroup>

        <FieldGroup label="Gloves">
          <PickerField value={glovesName} placeholder="Agent's gloves" icon={Hand} clearLabel="Agent's gloves" onChoose={onChooseGloves} onClear={onBareArms} />
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
              {viewmodel.gloveSeed !== null && (
                <Button variant="link" size="xs" className="self-start px-0" onClick={() => onViewmodel({ gloveSeed: null })}>Use the gloves' own pattern</Button>
              )}
            </>
          )}
        </FieldGroup>

        <FieldGroup label="Viewmodel">
          <LabeledSlider label="FOV" value={viewmodel.fov} min={54} max={68} step={1} format={(v) => v.toFixed(0)} onChange={(fov) => onViewmodel({ fov })} />
          <LabeledSlider label="Offset X" value={viewmodel.offsetX} min={-2} max={2.5} step={0.1} format={(v) => v.toFixed(1)} onChange={(offsetX) => onViewmodel({ offsetX })} />
          <LabeledSlider label="Offset Y" value={viewmodel.offsetY} min={-2} max={2} step={0.1} format={(v) => v.toFixed(1)} onChange={(offsetY) => onViewmodel({ offsetY })} />
          <LabeledSlider label="Offset Z" value={viewmodel.offsetZ} min={-2} max={2} step={0.1} format={(v) => v.toFixed(1)} onChange={(offsetZ) => onViewmodel({ offsetZ })} />
          <div className="mt-1 flex flex-col gap-2.5">
            <SwitchField checked={viewmodel.leftHanded} label="Left hand" onChange={(leftHanded) => onViewmodel({ leftHanded })} />
            <SwitchField checked={viewmodel.sway} label="Weapon sway" onChange={(sway) => onViewmodel({ sway })} />
          </div>
        </FieldGroup>
      </div>
    </Section>
  )
}

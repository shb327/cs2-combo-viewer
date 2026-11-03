import { RotateCcw } from 'lucide-react'
import { FieldRow } from '@/components/common/field-row'
import { LabeledSlider } from '@/components/common/labeled-slider'
import { Section } from '@/components/common/section'
import { SwitchField } from '@/components/common/switch-field'
import { Button } from '@/components/ui/button'
import { LIGHTING_PRESETS } from '@/hooks/use-lighting'
import { cn } from '@/lib/utils'
import { DEFAULT_LIGHTING, type Lighting } from '@/lib/viewer/viewer-options'

interface LightingSectionProps {
  lighting: Lighting
  presetId: string | null
  onChange: (changes: Partial<Lighting>) => void
}

/**
 * Lighting: presets, brightness, the key / rim / ambient lights,
 * their angle, and the orbit and follow-camera effects.
 */
export function LightingSection({ lighting, presetId, onChange }: LightingSectionProps) {
  return (
    <Section
      title="Lighting"
      collapsible={{ id: 'lighting', defaultOpen: false }}
      aside={
        <Button variant="ghost" size="icon-xs" aria-label="Reset lighting" title="Reset lighting" onClick={() => onChange({ ...DEFAULT_LIGHTING, map: lighting.map })}>
          <RotateCcw />
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1.5">
          {LIGHTING_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ ...p.lighting, map: lighting.map })}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10.5px] font-medium',
                presetId === p.id ? 'bevel-primary text-white' : 'bevel text-foreground/80',
              )}
            >
              <span className="flex">
                <span className="size-3 rounded-full ring-1 ring-black/40" style={{ background: p.swatch[0] }} />
                <span className="-ml-1 size-3 rounded-full ring-1 ring-black/40" style={{ background: p.swatch[1] }} />
              </span>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <LabeledSlider label="Bright" value={lighting.exposure} min={0.3} max={2.2} step={0.01} format={(v) => v.toFixed(2)} onChange={(exposure) => onChange({ exposure })} />
          <LabeledSlider label="Key" value={lighting.key} min={0} max={6} step={0.05} format={(v) => v.toFixed(1)} onChange={(key) => onChange({ key })} />
          <LabeledSlider label="Rim" value={lighting.rim} min={0} max={5} step={0.05} format={(v) => v.toFixed(1)} onChange={(rim) => onChange({ rim })} />
          <LabeledSlider label="Ambient" value={lighting.ambient} min={0} max={2} step={0.01} format={(v) => v.toFixed(2)} onChange={(ambient) => onChange({ ambient })} />
          <LabeledSlider label="Angle" value={lighting.angle} min={-180} max={180} step={1} format={(v) => v.toFixed(0) + '°'} onChange={(angle) => onChange({ angle })} />
        </div>

        <FieldRow label="Colors">
          <label className="flex items-center gap-1.5 text-[11px] text-foreground/80">
            <input type="color" value={lighting.keyColor} onChange={(e) => onChange({ keyColor: e.target.value })} className="size-6 cursor-pointer rounded-md border border-white/15 bg-transparent p-0" />
            Key
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-foreground/80">
            <input type="color" value={lighting.rimColor} onChange={(e) => onChange({ rimColor: e.target.value })} className="size-6 cursor-pointer rounded-md border border-white/15 bg-transparent p-0" />
            Rim
          </label>
        </FieldRow>

        <div className="flex flex-col gap-2.5">
          <SwitchField checked={lighting.orbit} label="Rotating light" onChange={(orbit) => onChange({ orbit })} />
          <SwitchField checked={lighting.followCamera} label="Light follows the camera" onChange={(followCamera) => onChange({ followCamera })} />
        </div>
      </div>
    </Section>
  )
}

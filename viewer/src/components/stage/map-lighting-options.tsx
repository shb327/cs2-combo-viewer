import { Lamp, RotateCcw, Sparkles, Sun, SunDim, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LabeledSlider } from '@/components/common/labeled-slider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEFAULT_MAP_LIGHTING, type LightSource, type MapLighting } from '@/lib/viewer/viewer-options'

interface MapLightingOptionsProps {
  lighting: MapLighting
  /** What lights the current view (null: unknown yet). */
  sources: LightSource[] | null
  onChange: (changes: Partial<MapLighting>) => void
}

const LIGHTS: { key: keyof MapLighting; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'sun', label: 'Sun', icon: Sun, hint: 'The map’s sun' },
  { key: 'item', label: 'Item light', icon: Lamp, hint: 'The spot lights the game aims at a weapon, gloves or agent' },
  { key: 'scene', label: 'Map lights', icon: SunDim, hint: 'The map’s own lights around the inspect spot' },
  { key: 'ambient', label: 'Ambient', icon: Sparkles, hint: 'The light probes’ light from around' },
  { key: 'reflections', label: 'Reflections', icon: Waves, hint: 'The environment in metals and gloss' },
]

const NAMES: Record<LightSource, string> = { sun: 'sun', item: 'item light', scene: 'map lights', ambient: 'ambient', reflections: 'reflections', studio: 'studio key and rim' }

/**
 * The map lights' strengths, as the game's inspect rig lights each kind of item (a weapon: sun, its item light, the
 * map's lights and ambient; a charm or sticker alone and first person: sun and ambient). The sources the current view
 * doesn't use are dimmed; in the studio the left panel's Lighting applies.
 */
export function MapLightingOptions({ lighting, sources, onChange }: MapLightingOptionsProps) {
  const studio = sources?.length === 1 && sources[0] === 'studio'
  const changed = (Object.keys(DEFAULT_MAP_LIGHTING) as (keyof MapLighting)[]).some((k) => lighting[k] !== DEFAULT_MAP_LIGHTING[k])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lighting on maps</span>
        <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" disabled={!changed} onClick={() => onChange(DEFAULT_MAP_LIGHTING)}>
          <RotateCcw /> Game’s
        </Button>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {studio
          ? 'In the studio the item is lit by the Lighting panel on the left. These apply on a map, where each kind of item gets the game’s own lights.'
          : sources
            ? <>This item is lit by: <span className="text-foreground/85">{sources.map((s) => NAMES[s]).join(' · ')}</span>.</>
            : 'Each kind of item gets the game’s own lights on a map.'}
      </p>
      <div className="flex flex-col gap-2">
        {LIGHTS.map(({ key, label, icon: Icon, hint }) => {
          const used = !sources || studio || sources.includes(key)
          return (
            <div key={key} title={hint} className={cn('flex items-center gap-2 transition-opacity', !used && 'opacity-40')}>
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <LabeledSlider label={label} value={lighting[key]} min={0} max={2} step={0.05} format={(v) => (v === 1 ? 'game' : `×${v.toFixed(2)}`)} onChange={(v) => onChange({ [key]: v })} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

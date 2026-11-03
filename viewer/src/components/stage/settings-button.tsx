import { Gauge, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DialogHeading } from '@/components/common/dialog-heading'
import { FieldGroup } from '@/components/common/field-group'
import { SegmentedControl } from '@/components/common/segmented-control'
import { SwitchField } from '@/components/common/switch-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { MapLightingOptions } from '@/components/stage/map-lighting-options'
import type { LightSource, MapLighting, RenderQuality } from '@/lib/viewer/skin-viewer'

interface SettingsButtonProps {
  quality: RenderQuality
  onChange: (changes: Partial<RenderQuality>) => void
  mapLighting: MapLighting
  onMapLighting: (changes: Partial<MapLighting>) => void
  /** What it draws at right now (pixels per CSS pixel, frame rate) and what lights the view, read while the dialog is open. */
  readStatus: () => RenderStatus | null
}

export interface RenderStatus { pixelRatio: number; fps: number; lights: LightSource[] }

const RESOLUTIONS: { value: RenderQuality['resolution']; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 1, label: '1×' }, { value: 1.5, label: '1.5×' }, { value: 2, label: '2×' },
]

/** The stage's settings button (under share) and its dialog: how finely the viewer draws, and the map lights' strengths. */
export function SettingsButton({ quality, onChange, mapLighting, onMapLighting, readStatus }: SettingsButtonProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<RenderStatus | null>(null)

  useEffect(() => {
    if (!open) return
    const read = () => setStatus(readStatus())
    read()
    const timer = setInterval(read, 1000)
    return () => clearInterval(timer)
  }, [open, readStatus])

  return (
    <>
      <Button variant="outline" className="glass-panel pointer-events-auto size-10 rounded-2xl" aria-label="Display settings" title="Display settings" onClick={() => setOpen(true)}>
        <Settings />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-120">
          <DialogHeading icon={Settings} title="Display" description="How finely the viewer draws, and how the maps light the item." onClose={() => setOpen(false)} />
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
            <FieldGroup label="Resolution">
              <SegmentedControl options={RESOLUTIONS} value={quality.resolution} onChange={(resolution) => onChange({ resolution })} />
            </FieldGroup>
            <div className="flex flex-col gap-2.5">
              <SwitchField checked={quality.adaptive} label="Lower the resolution while it runs slow (Auto)" onChange={(adaptive) => onChange({ adaptive })} />
              <SwitchField checked={quality.antialias} label="Antialiasing (smooth edges; reloads the item)" onChange={(antialias) => onChange({ antialias })} />
              <SwitchField checked={quality.post} label="Map effects (bloom and color grading)" onChange={(post) => onChange({ post })} />
            </div>
            {status && (
              <div className="inset-well flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-muted-foreground">
                <Gauge className="size-4" />
                Now drawing at <span className="font-mono text-foreground">{status.pixelRatio.toFixed(2)}×</span> · <span className="font-mono text-foreground">{status.fps}</span> fps
              </div>
            )}
            <div className="border-t border-white/10 pt-4">
              <MapLightingOptions lighting={mapLighting} sources={status?.lights ?? null} onChange={onMapLighting} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

import { LabeledSlider } from '@/components/common/labeled-slider'
import { CharmSeedControl } from '@/components/common/charm-seed-control'
import { PickerField } from '@/components/common/picker-field'
import { Button } from '@/components/ui/button'
import { CHARM_MOVE_RANGE } from '@/lib/config'
import type { CharmDef } from '@/lib/data/attachments'
import type { CharmState } from '@/hooks/use-viewer-state'

interface CharmEditorProps {
  charm: CharmState
  hasCharmPoint: boolean
  isSlab: boolean
  charmDef: CharmDef | undefined
  charmName: string
  stickerName: string
  onChange: (changes: Partial<CharmState>) => void
  onChoose: () => void
  onChooseSticker: () => void
}

/** The weapon's charm: which one, its pattern, and where it hangs. */
export function CharmEditor({ charm, hasCharmPoint, isSlab, charmDef, charmName, stickerName, onChange, onChoose, onChooseSticker }: CharmEditorProps) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-muted-foreground">Charm{hasCharmPoint ? '' : ' (no charm point on this model)'}</div>
      <div className="flex flex-wrap gap-1.5">
        <Button variant={charm.id ? 'outline' : 'default'} size="sm" onClick={() => onChange({ id: null })}>None</Button>
        <Button variant={charm.id ? 'default' : 'outline'} size="sm" className="min-w-0 max-w-full truncate" onClick={onChoose}>
          {charm.id ? charmName : 'Choose…'}
        </Button>
      </div>
      {charm.id && (
        <div className="mt-3 flex flex-col gap-2.5">
          {isSlab && (
            <PickerField label="Sticker" value={charm.sticker ? stickerName : null} clearLabel="Remove slab sticker" onChoose={onChooseSticker} onClear={() => onChange({ sticker: null })} />
          )}
          <CharmSeedControl charm={charmDef} seed={charm.seed} onChange={(seed) => onChange({ seed })} />
          <LabeledSlider label="Along" value={charm.offset[0]} min={-CHARM_MOVE_RANGE[0]} max={CHARM_MOVE_RANGE[0]} step={0.05} format={(v) => v.toFixed(2) + '″'} onChange={(v) => onChange({ offset: [v, charm.offset[1]] })} />
          <LabeledSlider label="Height" value={charm.offset[1]} min={-CHARM_MOVE_RANGE[1]} max={CHARM_MOVE_RANGE[1]} step={0.05} format={(v) => v.toFixed(2) + '″'} onChange={(v) => onChange({ offset: [charm.offset[0], v] })} />
          <Button variant="link" size="xs" className="self-start px-0" onClick={() => onChange({ offset: [0, 0], position: null })}>Reset placement</Button>
        </div>
      )}
    </div>
  )
}

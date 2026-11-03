import { LayoutGrid, X } from 'lucide-react'
import { LabeledSlider } from '@/components/common/labeled-slider'
import { Button } from '@/components/ui/button'
import { STICKER_MAX, STICKER_MOVE_RANGE } from '@/lib/config'
import type { StickerOptions } from '@/lib/viewer/skin-viewer'

interface StickerEditorProps {
  stickers: StickerOptions[]
  active: number
  slotCount: number
  stickerName: (id: string) => string
  onActive: (index: number) => void
  onChange: (index: number, patch: Partial<StickerOptions>) => void
  onRemove: (index: number) => void
  onReplace: (index: number) => void
  onAdd: () => void
}

/** The weapon's stickers: the list, and the placement controls of the selected one. */
export function StickerEditor({ stickers, active, slotCount, stickerName, onActive, onChange, onRemove, onReplace, onAdd }: StickerEditorProps) {
  const current = stickers[active]
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-muted-foreground">Stickers{stickers.length ? ` (${stickers.length}/${STICKER_MAX})` : ''}</div>
      <div className="flex flex-col gap-1.5">
        {stickers.map((sticker, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Button variant={i === active ? 'default' : 'outline'} size="sm" className="min-w-0 flex-1 justify-start truncate" title={stickerName(sticker.id)} onClick={() => onActive(i)}>
              <span className="mr-1 font-mono text-[10.5px] opacity-60">{sticker.slot + 1}</span>
              <span className="truncate">{stickerName(sticker.id)}</span>
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Change sticker" onClick={() => onReplace(i)}><LayoutGrid /></Button>
            <Button variant="outline" size="icon-sm" aria-label="Remove sticker" onClick={() => onRemove(i)}><X /></Button>
          </div>
        ))}
        {stickers.length < STICKER_MAX && (
          <Button variant="outline" size="sm" className="self-start" onClick={onAdd}>+ Add sticker</Button>
        )}
      </div>
      {current && (
        <div className="mt-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 w-14 text-[11px] text-muted-foreground">Slot</span>
            {Array.from({ length: slotCount }, (_, i) => (
              <Button key={i} variant={current.slot === i ? 'default' : 'outline'} size="sm" className="w-8" onClick={() => onChange(active, { slot: i })}>{i + 1}</Button>
            ))}
          </div>
          <LabeledSlider label="Wear" value={current.wear} min={0} max={1} step={0.01} format={(v) => (v * 100).toFixed(0) + '%'} onChange={(v) => onChange(active, { wear: v })} />
          <LabeledSlider label="Move ↔" value={current.offset[0]} min={-STICKER_MOVE_RANGE[0]} max={STICKER_MOVE_RANGE[0]} step={0.001} format={(v) => v.toFixed(3)} onChange={(v) => onChange(active, { offset: [v, current.offset[1]] })} />
          <LabeledSlider label="Move ↕" value={current.offset[1]} min={-STICKER_MOVE_RANGE[1]} max={STICKER_MOVE_RANGE[1]} step={0.001} format={(v) => v.toFixed(3)} onChange={(v) => onChange(active, { offset: [current.offset[0], v] })} />
          <LabeledSlider label="Rotate" value={current.rotation} min={-180} max={180} step={1} format={(v) => v.toFixed(0) + '°'} onChange={(v) => onChange(active, { rotation: v })} />
          <LabeledSlider label="Size" value={current.scale ?? 1} min={0.5} max={1.5} step={0.01} format={(v) => '×' + v.toFixed(2)} onChange={(v) => onChange(active, { scale: v })} />
          <Button variant="link" size="xs" className="self-start px-0" onClick={() => onChange(active, { offset: [0, 0], rotation: 0, scale: 1 })}>Reset placement</Button>
        </div>
      )}
    </div>
  )
}

import { WEARS, type Wear } from '@/lib/wear'

interface FloatBarProps {
  float: number
  wear: Wear
  /** The skin's float range; the bar is dimmed outside it. */
  min: number
  max: number
}

const pct = (f: number) => `${Math.max(0, Math.min(1, f)) * 100}%`

/** The float on a 0–1 bar split into the wear bands, dimmed outside the skin's range, with a marker at the value. */
export function FloatBar({ float, wear, min, max }: FloatBarProps) {
  const bands = WEARS.map((w, i) => ({ ...w, from: i ? Math.min(1, WEARS[i - 1].max) : 0, to: Math.min(1, w.max) }))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[15px] font-semibold tabular-nums">{float.toFixed(10).replace(/0+$/, '').replace(/\.$/, '.0')}</span>
        <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: wear.color, borderColor: `${wear.color}55`, background: `${wear.color}14` }}>
          {wear.name}
        </span>
      </div>
      <div className="relative pt-2">
        <div className="relative flex h-2 overflow-hidden rounded-full shadow-[inset_0_1px_2px_oklch(0_0_0/60%)]">
          {bands.map((b) => <span key={b.short} className="h-full" style={{ width: pct(b.to - b.from), background: b.color, opacity: 0.75 }} />)}
          <span className="absolute inset-y-0 left-0 bg-black/65" style={{ width: pct(min) }} />
          <span className="absolute inset-y-0 right-0 bg-black/65" style={{ width: pct(1 - max) }} />
        </div>
        <span
          className="absolute top-0 size-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
          style={{ left: pct(float) }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>Range {min.toFixed(2)} – {max.toFixed(2)}</span>
        <span>{WEARS.map((w) => w.short).join(' · ')}</span>
      </div>
    </div>
  )
}

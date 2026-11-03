import { fadeColor, FADE_GRADIENT, fadeLabel, type FadeResult } from '@/lib/fade'

/** A Fade's percentage in the colour of its scale, with a meter from the worst seed (80%) to the best (100%): a row for the pattern card. */
export function FadeMeter({ fade }: { fade: FadeResult }) {
  const color = fadeColor(fade.percentage)
  const at = (fade.percentage - 80) / 20
  return (
    <div className="mt-3.5 flex items-center gap-2.5" title={`Fade percentage (80–100). Rank ${fade.ranking}: 1 is the best seed or the worst, about 500 the middle`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Fade</span>
      <span className="font-mono text-[16px] font-semibold leading-none tabular-nums" style={{ color }}>{fadeLabel(fade)}</span>
      <span className="relative ml-auto h-1.5 w-24 rounded-full" style={{ background: FADE_GRADIENT }}>
        <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/60 shadow" style={{ left: `${at * 100}%` }} />
      </span>
    </div>
  )
}

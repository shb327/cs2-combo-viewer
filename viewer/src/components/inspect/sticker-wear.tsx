/** A sticker's wear as a label and a bar of what is left of it (0 = pristine, 1 = scraped off). */
export function StickerWear({ wear }: { wear: number }) {
  return (
    <div className="flex w-20 shrink-0 flex-col items-end gap-1">
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{wear > 0 ? `${Math.round(wear * 100)}% scraped` : 'Pristine'}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-black/40">
        <span className="block h-full rounded-full bg-zinc-300" style={{ width: `${(1 - wear) * 100}%` }} />
      </span>
    </div>
  )
}

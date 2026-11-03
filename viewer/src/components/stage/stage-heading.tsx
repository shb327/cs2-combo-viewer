import { Badge } from '@/components/ui/badge'
import type { Heading } from '@/lib/heading'

/** The stage's title block: what kind of item in its rarity color, the name, and chips. */
export function StageHeading({ heading }: { heading: Heading }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 p-5 max-lg:pt-16 pr-20 sm:pr-40 lg:p-6 lg:pr-44">
      <div
        className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: heading.color, borderColor: `${heading.color}66`, background: `${heading.color}1f` }}
      >
        <span className="size-1.5 rounded-full" style={{ background: heading.color }} />
        {heading.over}
      </div>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight drop-shadow-[0_4px_18px_oklch(0_0_0/60%)] lg:text-[32px]">{heading.title}</h1>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {heading.chips.map((chip) => <Badge key={chip} variant="outline" className="border-white/15 bg-black/25">{chip}</Badge>)}
      </div>
    </div>
  )
}

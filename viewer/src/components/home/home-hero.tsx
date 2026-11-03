import { ArrowRight, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DEFAULT_SKIN } from '@/lib/config'
import { selectionPath } from '@/lib/selection'


export function HomeHero({ onSearch }: { onSearch: () => void }) {
  return (
    <section className="relative grid items-center gap-8 xl:grid-cols-[1fr_1.15fr]">
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-72 w-md rounded-full bg-violet-600/25 blur-3xl" />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200">
          CS2 · in your browser
        </span>
        <h1 className="mt-4 text-[36px] font-semibold leading-[1.05] tracking-tight lg:text-[52px]">
          Knife and gloves,<br />
          <span className="bg-linear-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">in 3D.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          A knife held in a pair of gloves, in first person, with the real float and pattern of both.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button size="lg" className="h-11 rounded-2xl px-5" render={<Link to={selectionPath({ kind: 'skin', ...DEFAULT_SKIN })} />}>
            Open the viewer <ArrowRight />
          </Button>
          <Button size="lg" variant="outline" className="h-11 rounded-2xl px-5" onClick={onSearch}>
            <Search /> Search or paste a link
          </Button>
        </div>
      </div>
      <div className="tile relative aspect-video overflow-hidden p-0 shadow-[0_40px_90px_-40px_oklch(0.5_0.25_300/55%)]">
        <div aria-hidden className="absolute inset-0 bg-linear-to-br from-violet-950 to-background" />
      </div>
    </section>
  )
}

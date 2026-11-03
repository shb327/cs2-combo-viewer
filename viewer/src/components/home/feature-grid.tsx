import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HOME_FEATURES } from '@/lib/home'
import { tiltHandlers } from '@/lib/tilt'

/** What the viewer does, a card each, every one opening an example of it. */
export function FeatureGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {HOME_FEATURES.map(({ icon: Icon, title, text, to, cta }) => (
        <Link key={title} to={to} {...tiltHandlers} className="group tile tilt-card flex flex-col gap-2.5 p-4 transition hover:border-white/20">
          <span className="bevel-primary grid size-10 place-items-center rounded-xl text-white"><Icon className="size-5" /></span>
          <span className="text-[15px] font-semibold">{title}</span>
          <span className="flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{text}</span>
          <span className="flex items-center gap-1 text-[12.5px] font-medium text-violet-300">{cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
        </Link>
      ))}
    </div>
  )
}

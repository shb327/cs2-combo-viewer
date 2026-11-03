import type { ReactNode } from 'react'

interface ApiSectionProps {
  id: string
  title: string
  intro?: ReactNode
  children: ReactNode
}


export function ApiSection({ id, title, intro, children }: ApiSectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <a href={`#${id}`} className="group flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-linear-to-b from-violet-400 to-fuchsia-500" />
        <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
        <span className="text-muted-foreground opacity-0 transition group-hover:opacity-100">#</span>
      </a>
      {intro && <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

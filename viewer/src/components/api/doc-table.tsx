import type { DocRow } from '@/lib/api-docs'

interface DocTableProps {
  rows: DocRow[]
  nameLabel: string
  withValues?: boolean
}

export function DocTable({ rows, nameLabel, withValues }: DocTableProps) {
  return (
    <div className="tile overflow-hidden">
      <div className={`hidden gap-4 border-b border-white/10 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid ${withValues ? 'md:grid-cols-[minmax(170px,1fr)_minmax(140px,0.9fr)_2fr_minmax(110px,0.8fr)]' : 'md:grid-cols-[minmax(220px,1fr)_1.6fr]'}`}>
        <span>{nameLabel}</span>
        {withValues && <span>Values</span>}
        <span>What it does</span>
        {withValues && <span>Default</span>}
      </div>
      {rows.map((row) => (
        <div
          key={row.name}
          className={`grid gap-1.5 border-b border-white/5 px-4 py-3 last:border-b-0 md:gap-4 ${withValues ? 'md:grid-cols-[minmax(170px,1fr)_minmax(140px,0.9fr)_2fr_minmax(110px,0.8fr)]' : 'md:grid-cols-[minmax(220px,1fr)_1.6fr]'}`}
        >
          <code className="self-start wrap-break-word font-mono text-[12.5px] text-violet-200">{row.name}</code>
          {withValues && <span className="break-all font-mono text-[12px] text-foreground/75">{row.values ?? '—'}</span>}
          <span className="text-[13px] leading-relaxed text-foreground/85">{row.description}</span>
          {withValues && <span className="text-[12px] text-muted-foreground"><span className="md:hidden">Default: </span>{row.fallback ?? '—'}</span>}
        </div>
      ))}
    </div>
  )
}

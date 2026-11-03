import type { ReactNode } from 'react'

/** A small titled group of controls inside a section. */
export function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">{label}</span>
      {children}
    </div>
  )
}

interface StatProps {
  label: string
  value: string
  color?: string
}

/** A small label over a monospaced value, for the stage's read-out. */
export function Stat({ label, value, color }: StatProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span
        className="font-mono text-[13px] font-medium tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  )
}

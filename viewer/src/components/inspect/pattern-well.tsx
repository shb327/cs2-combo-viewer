/** A pattern number in a sunken well. */
export function PatternWell({ value }: { value: number }) {
  return <div className="inset-well grid h-[58px] min-w-24 place-items-center rounded-xl px-4 font-mono text-[20px] font-semibold tabular-nums">#{value}</div>
}

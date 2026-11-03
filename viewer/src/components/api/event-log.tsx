import { Radio, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LogEntry {
  id: number
  at: Date
  dir: 'in' | 'out'
  data: Record<string, unknown>
}

const short = (data: Record<string, unknown>) => {
  const { type, ...rest } = data
  const text = JSON.stringify(rest, (k, v) => (k === 'dataUrl' && typeof v === 'string' ? v.slice(0, 32) + '…' : v))
  return { type: String(type), rest: text === '{}' ? '' : text }
}

export function EventLog({ entries, onClear }: { entries: LogEntry[]; onClear: () => void }) {
  return (
    <div className="inset-well flex min-h-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 border-b border-white/6 px-3.5 py-2">
        <Radio className="size-3.5 text-emerald-300" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Messages</span>
        <button type="button" onClick={onClear} className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground">
          <Trash2 className="size-3.5" /> Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 font-mono text-[11.5px]">
        {!entries.length && <div className="px-1.5 py-3 text-muted-foreground">Waiting for the embed…</div>}
        {entries.map((e) => {
          const { type, rest } = short(e.data)
          return (
            <div key={e.id} className="flex gap-2 rounded-md px-1.5 py-1 hover:bg-white/4">
              <span className="shrink-0 tabular-nums text-muted-foreground/70">{e.at.toLocaleTimeString([], { hour12: false })}</span>
              <span className={cn('shrink-0', e.dir === 'in' ? 'text-emerald-300' : 'text-sky-300')}>{e.dir === 'in' ? '←' : '→'}</span>
              <span className="min-w-0 break-all">
                <span className={type === 'cs3d:error' ? 'text-red-300' : 'text-violet-200'}>{type}</span>
                {rest && <span className="text-foreground/60"> {rest}</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

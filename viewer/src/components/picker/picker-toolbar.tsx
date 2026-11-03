import { History, Search, X } from 'lucide-react'
import { SwitchField } from '@/components/common/switch-field'
import { Button } from '@/components/ui/button'
import { STICKER_KIND } from '@/lib/picker'

interface PickerToolbarProps {
  query: string
  placeholder: string
  /** The sticker finish filter, when browsing stickers (undefined hides it). */
  stickerKind?: string | null
  /** The "only ported" switch, when it applies (undefined hides it). */
  portedOnly?: boolean
  onQuery: (query: string) => void
  onStickerKind: (kind: string | null) => void
  onPortedOnly: (on: boolean) => void
  /** Arrow Down in the search box: on to the cards. */
  onEnterGrid?: () => void
  /** Enter in the search box (a pasted inspect link is ready to load). */
  onSubmit?: () => void
  /** Whether the inspect history is shown (undefined hides its button). */
  history?: boolean
  onHistory?: (on: boolean) => void
  onClose: () => void
}

/** The picker's top bar: the search box, the sticker finish filter or the "only ported" switch, the history and close. */
export function PickerToolbar({ query, placeholder, stickerKind, portedOnly, onQuery, onStickerKind, onPortedOnly, onEnterGrid, onSubmit, history, onHistory, onClose }: PickerToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit() }
            else if (e.key === 'ArrowDown' && onEnterGrid) { e.preventDefault(); onEnterGrid() }
          }}
          placeholder={placeholder}
          spellCheck={false}
          className="inset-well h-11 w-full rounded-2xl pl-10 pr-10 text-[14px] outline-none transition placeholder:text-muted-foreground focus:border-violet-400/60 focus:ring-4 focus:ring-violet-500/15"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => onQuery('')} className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {stickerKind !== undefined && (
        <div className="flex shrink-0 gap-1">
          {[null, ...Object.keys(STICKER_KIND)].map((k) => (
            <Button key={k ?? 'all'} variant={stickerKind === k ? 'default' : 'outline'} size="xs" onClick={() => onStickerKind(k)}>{k ? STICKER_KIND[k] : 'All'}</Button>
          ))}
        </div>
      )}
      {portedOnly !== undefined && <SwitchField checked={portedOnly} label="Only ported" onChange={onPortedOnly} />}
      {history !== undefined && (
        <Button variant={history ? 'default' : 'outline'} aria-pressed={history} title="Inspect links you loaded" onClick={() => onHistory?.(!history)}>
          <History /> History
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button>
    </div>
  )
}

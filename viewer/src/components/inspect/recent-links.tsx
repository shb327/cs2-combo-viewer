import { History } from 'lucide-react'
import { useMemo } from 'react'
import { ItemImage } from '@/components/common/item-image'
import { useDbImages } from '@/context/db-context'
import type { InspectHistoryEntry } from '@/hooks/use-inspect-history'
import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex } from '@/lib/data/catalog'
import { decodeInspectLink, type InspectItem } from '@/lib/data/inspect'
import { inspectPreview } from '@/lib/inspect-preview'
import { timeAgo } from '@/lib/time'

interface RecentLinksProps {
  entries: InspectHistoryEntry[]
  catalog: CatalogIndex | null
  attachments: AttachmentIndex | null
  agents: AgentIndex | null
  onLoad: (item: InspectItem, link: string) => void
  /** How many of the latest links are offered (default 3). */
  limit?: number
}


/** The last inspect links loaded, one per line: a click loads one again. */
export function RecentLinks({ entries, catalog, attachments, agents, onLoad, limit = 3 }: RecentLinksProps) {
  const images = useDbImages()
  const rows = useMemo(() => entries.slice(0, limit).flatMap((entry) => {
    try {
      const item = decodeInspectLink(entry.link)
      return [{ entry, item, preview: inspectPreview(item, catalog, attachments, images, agents) }]
    } catch { return [] }
  }), [entries, catalog, attachments, images, agents, limit])
  if (!rows.length) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><History className="size-3.5" /> Recent</span>
      {rows.map(({ entry, item, preview }) => (
        <button
          key={entry.link}
          type="button"
          onClick={() => onLoad(item, entry.link)}
          className="group/recent flex items-center gap-3 rounded-xl bg-black/15 p-1.5 pr-3 text-left transition hover:bg-white/[0.06]"
        >
          <ItemImage src={preview.image} color={preview.color} className="h-10 w-14 rounded-lg" imageClassName="transition-transform duration-200 group-hover/recent:scale-110" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{preview.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {preview.kind === 'skin' ? <><span style={{ color: preview.wear.color }}>{preview.wear.name}</span> · {preview.float.toFixed(6)} · #{preview.seed}</> : preview.weapon}
            </span>
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(entry.at)}</span>
        </button>
      ))}
    </div>
  )
}

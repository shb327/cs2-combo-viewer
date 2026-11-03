import { History, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Callout } from '@/components/common/callout'
import { HistoryRow } from '@/components/picker/history-row'
import { Button } from '@/components/ui/button'
import { useDbImages } from '@/context/db-context'
import type { InspectHistoryEntry } from '@/hooks/use-inspect-history'
import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex } from '@/lib/data/catalog'
import { decodeInspectLink, type InspectItem } from '@/lib/data/inspect'
import { inspectPreview } from '@/lib/inspect-preview'

interface HistoryListProps {
  entries: InspectHistoryEntry[]
  query: string
  catalog: CatalogIndex | null
  attachments: AttachmentIndex | null
  agents: AgentIndex | null
  /** Loads a link; an error message when the viewer can't show it. */
  onLoad: (item: InspectItem) => string | null
  onRemove: (link: string) => void
  onClear: () => void
}

/** The inspect links loaded before, newest first, one per line: a click loads one again. */
export function HistoryList({ entries, query, catalog, attachments, agents, onLoad, onRemove, onClear }: HistoryListProps) {
  const images = useDbImages()
  const [error, setError] = useState('')
  const rows = useMemo(() => entries.flatMap((entry) => {
    let item: InspectItem
    try { item = decodeInspectLink(entry.link) } catch { return [] }
    return [{ entry, item, preview: inspectPreview(item, catalog, attachments, images, agents) }]
  }), [entries, catalog, attachments, images, agents])
  const needle = query.trim().toLowerCase()
  const shown = needle ? rows.filter((r) => r.preview.title.toLowerCase().includes(needle)) : rows

  if (!entries.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <History className="size-8 opacity-60" />
        <span>No inspect links yet.</span>
        <span className="text-[12px]">The links you paste in the search show up here.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">Recent inspect links</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{shown.length}</span>
        <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={onClear}><Trash2 /> Clear history</Button>
      </div>
      {error && <Callout tone="error">{error}</Callout>}
      {!shown.length && <div className="py-12 text-center text-muted-foreground">Nothing matches “{query}”.</div>}
      <div className="flex flex-col gap-2">
        {shown.map(({ entry, item, preview }) => (
          <HistoryRow key={entry.link} preview={preview} at={entry.at} onLoad={() => setError(onLoad(item) ?? '')} onRemove={() => onRemove(entry.link)} />
        ))}
      </div>
    </div>
  )
}

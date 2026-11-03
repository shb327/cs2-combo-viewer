import { ClipboardPaste } from 'lucide-react'
import { useMemo } from 'react'
import { ItemImage } from '@/components/common/item-image'
import { Button } from '@/components/ui/button'
import { useDbImages } from '@/context/db-context'
import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex } from '@/lib/data/catalog'
import { decodeInspectLink } from '@/lib/data/inspect'
import { inspectPreview } from '@/lib/inspect-preview'

interface ClipboardOfferProps {
  link: string
  catalog: CatalogIndex | null
  attachments: AttachmentIndex | null
  agents: AgentIndex | null
  onUse: () => void
}

/** The inspect link found in the clipboard, named, with a button to put it in the field. */
export function ClipboardOffer({ link, catalog, attachments, agents, onUse }: ClipboardOfferProps) {
  const images = useDbImages()
  const preview = useMemo(() => inspectPreview(decodeInspectLink(link), catalog, attachments, images, agents), [link, catalog, attachments, images, agents])
  return (
    <div className="flex items-center gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 p-1.5 pr-2">
      <ItemImage src={preview.image} color={preview.color} className="h-10 w-14 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-violet-200/80">In your clipboard</span>
        <span className="block truncate text-[13px] font-medium">{preview.title}</span>
      </span>
      <Button size="sm" onClick={onUse}><ClipboardPaste /> Use it</Button>
    </div>
  )
}

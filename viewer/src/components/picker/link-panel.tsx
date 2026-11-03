import { Link2 } from 'lucide-react'
import { Callout } from '@/components/common/callout'
import { ItemPreview } from '@/components/inspect/item-preview'
import { Kbd } from '@/components/common/kbd'
import { Button } from '@/components/ui/button'
import type { InspectPreview } from '@/lib/inspect-preview'

interface LinkPanelProps {
  /** What the link says, once it decodes. */
  preview: InspectPreview | null
  error: string
  canLoad: boolean
  /** The catalog is still loading: names come later. */
  loadingNames: boolean
  onLoad: () => void
}

/** A pasted inspect link, in the picker's results: everything it carries (nothing is sent anywhere), and the button that loads it. */
export function LinkPanel({ preview, error, canLoad, loadingNames, onLoad }: LinkPanelProps) {
  return (
    <div className="flex flex-col gap-3 px-5 pb-6 pt-4">
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link2 className="size-3.5" />
        Inspect link: everything is read from the link itself.
      </div>
      {preview && !error && <ItemPreview preview={preview} />}
      {error && <Callout tone="error">{error}</Callout>}
      <div className="flex items-center justify-end gap-3">
        {loadingNames && <span className="mr-auto text-[11px] text-muted-foreground">Loading the catalog for names…</span>}
        <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">or press <Kbd>Enter</Kbd></span>
        <Button disabled={!canLoad} onClick={onLoad}>Load item</Button>
      </div>
    </div>
  )
}

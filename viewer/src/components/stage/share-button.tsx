import { Image as ImageIcon, Link2, Share2 } from 'lucide-react'
import { useState } from 'react'
import { DialogHeading } from '@/components/common/dialog-heading'
import { SegmentedControl } from '@/components/common/segmented-control'
import { ShareImagePanel } from '@/components/stage/share-image-panel'
import { ShareLinkPanel } from '@/components/stage/share-link-panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { ShareSource } from '@/lib/share-card'
import { cn } from '@/lib/utils'

interface ShareButtonProps {
  /** The view as it is when the dialog opens: its link, what the image says, and its render. */
  getShare: () => ShareSource
}

type Tab = 'link' | 'image'

/** The share dialog: the view's link, or an image of it to download. Open while `share` is set. */
export function ShareDialog({ share, onClose }: { share: ShareSource | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('link')
  return (
    <Dialog open={share !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className={cn('flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-3xl p-0', tab === 'image' ? 'sm:max-w-250' : 'sm:max-w-140')}>
        <DialogHeading icon={tab === 'image' ? ImageIcon : Link2} title="Share" description="A link to this view, or an image of it." onClose={onClose} />
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
          <SegmentedControl<Tab> options={[{ value: 'link', label: 'Link' }, { value: 'image', label: 'Image' }]} value={tab} onChange={setTab} className="max-w-60" />
          {share && (tab === 'link'
            ? <ShareLinkPanel link={share.link} />
            : <ShareImagePanel card={share.card} link={share.link.url} renderItem={share.renderItem} />)}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The stage's share button (under the map button) and its dialog. */
export function ShareButton({ getShare }: ShareButtonProps) {
  const [share, setShare] = useState<ShareSource | null>(null)
  return (
    <>
      <Button variant="outline" className="glass-panel pointer-events-auto size-10 rounded-2xl" aria-label="Share" title="Share this view" onClick={() => setShare(getShare())}>
        <Share2 />
      </Button>
      <ShareDialog share={share} onClose={() => setShare(null)} />
    </>
  )
}

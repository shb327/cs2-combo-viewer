import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ShareLink } from '@/lib/share-code'

/** The view's link in a field, ready to copy, and whether it is the short one. */
export function ShareLinkPanel({ link }: { link: ShareLink }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* the link stays selectable */ }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          readOnly
          value={link.url}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          className="inset-well h-11 min-w-0 flex-1 rounded-2xl px-3.5 font-mono text-[13px] outline-none focus:border-violet-400/60 focus:ring-4 focus:ring-violet-500/15"
        />
        <Button className="h-11 rounded-2xl px-4" onClick={copy}>
          {copied ? <><Check /> Copied</> : <><Copy /> Copy</>}
        </Button>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        {link.short
          ? 'Everything is packed in the link itself: it keeps working, nothing is stored anywhere.'
          : 'This view has something the short link can’t hold yet, so this is the full link.'}
      </p>
    </div>
  )
}

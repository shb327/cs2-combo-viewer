import { ArrowRight, Code2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CodeBlock } from '@/components/api/code-block'
import { Button } from '@/components/ui/button'
import { WEB_ORIGIN } from '@/lib/config'

const SNIPPET = `<iframe src="${WEB_ORIGIN}/embed?def=7&paint=180&map=de_mirage"
  width="960" height="540" style="border:0" allow="fullscreen"></iframe>`

/** For developers: the embed in one line, and the way to its docs and playground. */
export function ApiTeaser() {
  return (
    <div className="tile relative grid gap-5 overflow-hidden p-5 lg:grid-cols-[1fr_1.2fr] lg:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-60 w-80 rounded-full bg-fuchsia-600/15 blur-3xl" />
      <div className="relative flex flex-col gap-3">
        <span className="bevel-primary grid size-10 place-items-center rounded-xl text-white"><Code2 className="size-5" /></span>
        <h3 className="text-[20px] font-semibold tracking-tight">Put it on your site</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          The viewer embeds with one iframe: pick the item in its URL (an inspect link, def + paint, a skin, sticker, charm or agent), then change
          float, pattern, view or map, take screenshots and get share links with postMessage.
        </p>
        <Button className="mt-1 self-start" render={<Link to="/api" />}>Embed API docs & playground <ArrowRight /></Button>
      </div>
      <CodeBlock label="HTML" code={SNIPPET} className="relative self-center" />
    </div>
  )
}

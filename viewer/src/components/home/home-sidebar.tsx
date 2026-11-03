import { ArrowUpRight, Code2, History, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/common/brand-mark'
import { Kbd } from '@/components/common/kbd'
import { RecentLinks } from '@/components/inspect/recent-links'
import { Button } from '@/components/ui/button'
import type { InspectHistoryEntry } from '@/hooks/use-inspect-history'
import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex } from '@/lib/data/catalog'
import type { InspectItem } from '@/lib/data/inspect'
import { MOD_KEY } from '@/lib/keys'

interface HomeSidebarProps {
  history: InspectHistoryEntry[]
  catalog: CatalogIndex | null
  attachments: AttachmentIndex | null
  agents: AgentIndex | null
  onSearch: () => void
  onLoadRecent: (item: InspectItem, link: string) => void
}

/** The home page's panel: find an item, paste an inspect link, the links loaded before, and where else to go. */
export function HomeSidebar({ history, catalog, attachments, agents, onSearch, onLoadRecent }: HomeSidebarProps) {
  return (
    <aside className="glass-panel order-2 flex flex-col rounded-t-3xl lg:min-h-0 lg:order-1 lg:w-[340px] lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-l-0 lg:shadow-none">
      <div className="flex items-center border-b border-white/10 px-3.5 py-2">
        <BrandMark className="flex-1" />
      </div>

      <div className="flex flex-1 flex-col gap-3.5 px-4 py-4 lg:min-h-0 lg:overflow-y-auto">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Start</span>
        <button type="button" onClick={onSearch} className="bevel-primary flex items-center gap-3 rounded-2xl p-3 text-left text-white">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15"><Search className="size-4.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Find an item</span>
            <span className="block text-[11.5px] text-white/75">Skins, stickers, charms, agents, or paste an inspect link</span>
          </span>
          <Kbd className="hidden sm:inline-flex">{MOD_KEY} K</Kbd>
        </button>

        <div className="mt-2">
          {history.length
            ? <RecentLinks entries={history} catalog={catalog} attachments={attachments} agents={agents} onLoad={onLoadRecent} limit={6} />
            : (
              <div className="tile flex flex-col items-center gap-1.5 p-4 text-center text-[12px] text-muted-foreground">
                <History className="size-5 opacity-70" />
                The inspect links you paste in the search show up here.
              </div>
            )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-white/10 p-3">
        <Button variant="ghost" className="justify-start" render={<Link to="/api" />}><Code2 /> Embed API <span className="ml-auto text-[11px] text-muted-foreground">for developers</span></Button>
        <Button variant="ghost" className="justify-start" render={<a href="https://chainskins.net" target="_blank" rel="noopener" />}><ArrowUpRight /> chainskins.net</Button>
      </div>
    </aside>
  )
}

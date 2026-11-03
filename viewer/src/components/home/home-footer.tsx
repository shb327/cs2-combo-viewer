import { Link } from 'react-router-dom'

const LINK = 'transition-colors hover:text-foreground'

/** The home page's footer: what this is, where to go next, and the Valve disclaimer. */
export function HomeFooter() {
  return (
    <footer className="border-t border-white/10 pt-8 text-[12.5px] text-muted-foreground">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            <img src="/logo/favicon.svg" alt="" className="size-5" /> chainskins 3D
          </div>
          <p className="mt-2 leading-relaxed">CS2 skins in your browser, on the game’s own shaders: real float and pattern, stickers, charms, gloves, agents and inspect maps.</p>
        </div>
        <nav aria-label="Viewer" className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">Viewer</span>
          <Link to="/" className={LINK}>Home</Link>
          <Link to="/api" className={LINK}>Embed API</Link>
          <Link to="/api#playground" className={LINK}>Playground</Link>
        </nav>
        <nav aria-label="chainskins" className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">chainskins</span>
          <a href="https://chainskins.net" target="_blank" rel="noopener" className={LINK}>chainskins.net</a>
          <a href="https://hub.chainskins.net/legal/terms-conditions/" target="_blank" rel="noopener" className={LINK}>Terms</a>
          <a href="https://hub.chainskins.net/legal/privacy-policy/" target="_blank" rel="noopener" className={LINK}>Privacy</a>
        </nav>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/5 py-5 text-[11.5px]">
        <span>© {new Date().getFullYear()} chainskins</span>
        <span>Not affiliated with Valve Corporation. Counter-Strike 2 and its items are trademarks of Valve.</span>
      </div>
    </footer>
  )
}

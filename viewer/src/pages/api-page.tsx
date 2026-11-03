import { ArrowUpRight, Code2, MessagesSquare, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiSection } from '@/components/api/api-section'
import { BrandMark } from '@/components/common/brand-mark'
import { CodeBlock } from '@/components/api/code-block'
import { DocTable } from '@/components/api/doc-table'
import { EmbedPlayground } from '@/components/api/embed-playground'
import { Button } from '@/components/ui/button'
import { API_SECTIONS, COMMANDS, EVENTS, LISTEN_SAMPLE, OPTION_PARAMS, TARGET_PARAMS } from '@/lib/api-docs'
import { DEFAULT_SKIN, WEB_ORIGIN } from '@/lib/config'
import { selectionPath } from '@/lib/selection'

const QUICK_START = `<iframe
  src="${WEB_ORIGIN}/embed?def=7&paint=180&float=0.05&seed=1&map=de_mirage"
  width="960" height="540" style="border:0" allow="fullscreen"></iframe>`

const HIGHLIGHTS = [
  { icon: Code2, title: 'One iframe', text: 'The URL picks the item (an inspect link, def + paint, a skin, sticker, charm or agent) and how it’s shown.' },
  { icon: MessagesSquare, title: 'Driven by postMessage', text: 'Change float, pattern, view or map, play the inspect, take a screenshot, read its state: no reload.' },
  { icon: ShieldCheck, title: 'Nothing kept', text: 'The embed leaves the visitor’s browser alone: the full viewer’s lighting, viewmodel and loadout stay untouched.' },
]

export function ApiPage() {
  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-40 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 lg:px-6">
          <BrandMark />
          <span className="text-muted-foreground/50">/</span>
          <span className="text-[13px] font-medium">Embed API</span>
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">v1</span>
          <Button size="sm" variant="outline" className="ml-auto" render={<Link to={selectionPath({ kind: 'skin', ...DEFAULT_SKIN })} />}>
            Open the viewer <ArrowUpRight />
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[200px_1fr] lg:px-6">
        <nav className="hidden lg:block">
          <div className="sticky top-20 flex flex-col gap-0.5">
            <span className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">On this page</span>
            {API_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground">{s.title}</a>
            ))}
          </div>
        </nav>

        <main className="flex min-w-0 flex-col gap-14">
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-56 w-96 rounded-full bg-violet-600/25 blur-3xl" />
            <span className="relative inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200">
              <Sparkles className="size-3.5" /> Public API
            </span>
            <h1 className="relative mt-3 text-[34px] font-semibold leading-tight tracking-tight lg:text-[44px]">Put CS2 skins in 3D on your site</h1>
            <p className="relative mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              <code className="text-violet-200">/embed</code> is the viewer alone — just the 3D view, with the game’s own shaders, stickers, charms, first
              person and inspect maps. Drop it in an iframe, pick the item in its URL, and drive it with messages.
            </p>
            <div className="relative mt-6 grid gap-3 md:grid-cols-3">
              {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
                <div key={title} className="tile flex flex-col gap-2 p-4">
                  <div className="bevel-primary grid size-9 place-items-center rounded-xl text-white"><Icon className="size-4.5" /></div>
                  <span className="text-[14px] font-semibold">{title}</span>
                  <span className="text-[12.5px] leading-relaxed text-muted-foreground">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <ApiSection id="quick-start" title="Quick start" intro="Paste this where the viewer should be. It shows the AK-47 | Fire Serpent at 0.05 float on Mirage.">
            <CodeBlock label="HTML" code={QUICK_START} />
          </ApiSection>

          <ApiSection id="playground" title="Playground" intro="A real embed. The controls send the messages listed below — watch them go out (→) and the embed answer (←), and copy the iframe for the setup you build.">
            <EmbedPlayground />
          </ApiSection>

          <ApiSection id="what" title="What to show" intro="One of these in the URL. If several are given, the first in this order wins.">
            <DocTable rows={TARGET_PARAMS} nameLabel="Param" />
          </ApiSection>

          <ApiSection id="how" title="How to show it" intro="The loadout_* params are what the player wears: they apply in first person (view=fpv) and on an agent, not to the item shown.">
            <DocTable rows={OPTION_PARAMS} nameLabel="Param" withValues />
            <p className="mt-3 text-[12.5px] text-muted-foreground">A weapon’s charm comes only from an inspect link. Stickers and the charm can’t be changed by message yet: load another link instead (<code className="text-violet-200">cs3d:load</code> with <code className="text-violet-200">{'{ inspect }'}</code>).</p>
          </ApiSection>

          <ApiSection id="to-embed" title="Messages to the embed" intro={<>Send them with <code className="text-violet-200">iframe.contentWindow.postMessage(message, '*')</code>. Any page may drive an embed it frames; replies go back to the sender only.</>}>
            <DocTable rows={COMMANDS} nameLabel="Message" />
          </ApiSection>

          <ApiSection id="from-embed" title="Messages from the embed" intro={<>They arrive as <code className="text-violet-200">message</code> events on your page’s window. Check that <code className="text-violet-200">event.source</code> is the iframe’s window, and that <code className="text-violet-200">event.origin</code> is {WEB_ORIGIN}.</>}>
            <DocTable rows={EVENTS} nameLabel="Message" />
            <CodeBlock label="JavaScript" code={LISTEN_SAMPLE} className="mt-4" />
          </ApiSection>

          <ApiSection id="notes" title="Good to know">
            <ul className="grid gap-3 md:grid-cols-2">
              {[
                ['Watermark', <>The embed carries a small chainskins.net watermark in its corner, linking to the full viewer and burnt into its screenshots. It is always there: <code className="text-violet-200">ui=0</code> doesn’t hide it.</>],
                ['Framing', <>Only <code className="text-violet-200">/embed</code> may be framed (it sends <code className="text-violet-200">frame-ancestors *</code>); the rest of the site can’t be put in an iframe.</>],
                ['Transparent', <><code className="text-violet-200">bg=transparent</code> drops the studio backdrop: your page shows through behind the item.</>],
                ['Example page', <>A plain HTML page driving an embed: <a className="text-violet-300 underline-offset-2 hover:underline" href="/embed-example.html">/embed-example.html</a>.</>],
              ].map(([title, body]) => (
                <li key={String(title)} className="tile p-4">
                  <div className="text-[13.5px] font-semibold">{title}</div>
                  <div className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</div>
                </li>
              ))}
            </ul>
          </ApiSection>
        </main>
      </div>
    </div>
  )
}

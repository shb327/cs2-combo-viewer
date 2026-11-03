import { Camera, Crosshair, Hand, Link2, Play, ScanSearch, Share2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CodeBlock } from '@/components/api/code-block'
import { EventLog, type LogEntry } from '@/components/api/event-log'
import { FieldGroup } from '@/components/common/field-group'
import { LabeledSlider } from '@/components/common/labeled-slider'
import { SelectMenu } from '@/components/common/select-menu'
import { SegmentedControl } from '@/components/common/segmented-control'
import { SwitchField } from '@/components/common/switch-field'
import { Button } from '@/components/ui/button'
import { EMBED_MAPS } from '@/lib/api-docs'
import { WEB_ORIGIN } from '@/lib/config'

type Source = 'defpaint' | 'inspect' | 'skin'

const EXAMPLE_INSPECT = 'steam://run/730//+csgo_econ_action_preview%20849452691B1D4D859C38ADA484AC82B480E68E8C84945FA3A1EDDC0ABBE68E8C869456A7A144890EBBEC0704040488F4939EFE2A1E'

interface Settings {
  source: Source
  def: string
  paint: string
  inspect: string
  skin: string
  float: number
  seed: number
  view: 'orbit' | 'fpv'
  map: string
  autoRotate: boolean
  knifePose: 'vertical' | 'horizontal' | 'tilted'
  side: 'front' | 'back'
}

const DEFAULTS: Settings = {
  source: 'defpaint', def: '7', paint: '180', inspect: EXAMPLE_INSPECT, skin: 'weapon_awp|cu_medieval_dragon_awp',
  float: 0.05, seed: 1, view: 'orbit', map: 'de_mirage', autoRotate: false, knifePose: 'tilted', side: 'front',
}


function embedQuery(s: Settings): string {
  const q = new URLSearchParams()
  if (s.source === 'defpaint') { q.set('def', s.def); q.set('paint', s.paint) }
  else if (s.source === 'inspect') q.set('inspect', s.inspect)
  else q.set('skin', s.skin)
  if (s.source !== 'inspect' || s.float !== DEFAULTS.float) q.set('float', String(s.float))
  if (s.seed !== 1) q.set('seed', String(s.seed))
  if (s.view !== 'orbit') q.set('view', s.view)
  if (s.map !== 'studio') q.set('map', s.map)
  if (s.autoRotate) q.set('auto_rotate', '1')
  if (s.knifePose !== 'tilted') q.set('knife_pose', s.knifePose)
  if (s.side !== 'front') q.set('side', s.side)
  return q.toString().replace(/%7C/g, '|')
}


export function EmbedPlayground() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [s, setS] = useState<Settings>(DEFAULTS)
  const [src, setSrc] = useState(() => 'https://3d.chainskins.net/embed?' + embedQuery(DEFAULTS))
  const [log, setLog] = useState<LogEntry[]>([])
  const [shot, setShot] = useState<string | null>(null)
  const nextId = useRef(0)

  const push = useCallback((dir: LogEntry['dir'], data: Record<string, unknown>) => {
    setLog((prev) => [{ id: nextId.current++, at: new Date(), dir, data }, ...prev].slice(0, 60))
  }, [])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !String(e.data?.type).startsWith('cs3d:')) return
      if (e.data.type === 'cs3d:screenshot') setShot(e.data.dataUrl)
      push('in', e.data)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [push])

  const send = (message: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage(message, '*')
    push('out', message)
  }
  const set = (changes: Partial<Settings>, options?: Record<string, unknown>) => {
    setS((prev) => ({ ...prev, ...changes }))
    if (options) send({ type: 'cs3d:set', options })
  }
  const load = () => {
    const target = s.source === 'defpaint' ? { def: Number(s.def), paint: Number(s.paint) } : s.source === 'inspect' ? { inspect: s.inspect } : { skin: s.skin }
    send({ type: 'cs3d:load', target, options: s.source === 'inspect' ? {} : { float: s.float, seed: s.seed } })
  }

  const query = useMemo(() => embedQuery(s), [s])
  const iframeCode = `<iframe\n  src="${WEB_ORIGIN}/embed?${query}"\n  width="960" height="540" style="border:0;border-radius:16px"\n  allow="fullscreen"></iframe>`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="tile relative aspect-video overflow-hidden p-0">
          <iframe ref={frame} title="Embed playground" src={src} allow="fullscreen" className="absolute inset-0 size-full border-0" />
        </div>

        <div className="tile flex flex-col gap-4 p-4">
          <FieldGroup label="Item">
            <SegmentedControl<Source> options={[{ value: 'defpaint', label: 'def + paint' }, { value: 'inspect', label: 'Inspect' }, { value: 'skin', label: 'skin' }]} value={s.source} onChange={(source) => set({ source })} />
            <div className="mt-2 flex gap-2">
              {s.source === 'defpaint' && (
                <>
                  <input value={s.def} onChange={(e) => set({ def: e.target.value })} aria-label="def" placeholder="def" className="inset-well h-9 w-full rounded-xl px-3 font-mono text-[12.5px] outline-none" />
                  <input value={s.paint} onChange={(e) => set({ paint: e.target.value })} aria-label="paint" placeholder="paint" className="inset-well h-9 w-full rounded-xl px-3 font-mono text-[12.5px] outline-none" />
                </>
              )}
              {s.source === 'inspect' && <input value={s.inspect} onChange={(e) => set({ inspect: e.target.value })} aria-label="inspect link" className="inset-well h-9 w-full rounded-xl px-3 font-mono text-[12px] outline-none" />}
              {s.source === 'skin' && <input value={s.skin} onChange={(e) => set({ skin: e.target.value })} aria-label="skin key" className="inset-well h-9 w-full rounded-xl px-3 font-mono text-[12.5px] outline-none" />}
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={load}><Play /> cs3d:load</Button>
              <Button size="sm" variant="outline" onClick={() => { setLog([]); setSrc('/embed?' + query) }} title="Reload the iframe with this URL">Reload URL</Button>
            </div>
          </FieldGroup>

          <LabeledSlider label="Float" value={s.float} min={0} max={1} step={0.001} format={(v) => v.toFixed(3)} onChange={(float) => set({ float }, { float })} />
          <LabeledSlider label="Seed" value={s.seed} min={1} max={1000} step={1} format={(v) => '#' + v} onChange={(seed) => set({ seed }, { seed })} />

          <FieldGroup label="View">
            <SegmentedControl options={[{ value: 'orbit' as const, label: 'orbit' }, { value: 'fpv' as const, label: 'fpv' }]} value={s.view} onChange={(view) => set({ view }, { view })} />
          </FieldGroup>
          <FieldGroup label="Map">
            <SelectMenu align="left" label="map" options={EMBED_MAPS.map((m) => ({ value: m, label: m }))} value={s.map} onChange={(map) => { set({ map }); send({ type: 'cs3d:setMap', map }) }} />
          </FieldGroup>
          <FieldGroup label="Side">
            <SegmentedControl options={[{ value: 'front' as const, label: 'front' }, { value: 'back' as const, label: 'back' }]} value={s.side} onChange={(side) => set({ side }, { side })} />
          </FieldGroup>
          <FieldGroup label="Knife pose">
            <SegmentedControl options={[{ value: 'vertical' as const, label: 'vertical' }, { value: 'horizontal' as const, label: 'horizontal' }, { value: 'tilted' as const, label: 'tilted' }]} value={s.knifePose} onChange={(knifePose) => set({ knifePose, side: 'front' }, { knife_pose: knifePose })} />
          </FieldGroup>
          <SwitchField checked={s.autoRotate} label="auto_rotate" onChange={(on) => set({ autoRotate: on }, { auto_rotate: on })} />

          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="outline" onClick={() => send({ type: 'cs3d:inspect' })}><ScanSearch /> Inspect</Button>
            <Button size="sm" variant="outline" onClick={() => send({ type: 'cs3d:inspectGloves' })}><Hand /> Gloves</Button>
            <Button size="sm" variant="outline" onClick={() => { set({ side: 'front' }); send({ type: 'cs3d:resetView' }) }}><Crosshair /> Reset view</Button>
            <Button size="sm" variant="outline" onClick={() => send({ type: 'cs3d:screenshot', id: 'shot' })}><Camera /> Screenshot</Button>
            <Button size="sm" variant="outline" onClick={() => send({ type: 'cs3d:share', id: 'link' })}><Link2 /> Share link</Button>
            <Button size="sm" variant="outline" onClick={() => send({ type: 'cs3d:openShare' })}><Share2 /> Share dialog</Button>
            <Button size="sm" variant="outline" className="col-span-2" onClick={() => send({ type: 'cs3d:getState', id: 'state' })}><Sparkles /> cs3d:getState</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <CodeBlock label="HTML · this setup" code={iframeCode} />
          {shot && (
            <div className="tile flex items-center gap-3 p-3">
              <img src={shot} alt="Last screenshot" className="h-20 rounded-lg ring-1 ring-white/10" />
              <span className="text-[12px] text-muted-foreground">The last <code className="text-violet-200">cs3d:screenshot</code> reply: a PNG data URL, watermarked.</span>
            </div>
          )}
        </div>
        <div className="h-80">
          <EventLog entries={log} onClear={() => setLog([])} />
        </div>
      </div>
    </div>
  )
}

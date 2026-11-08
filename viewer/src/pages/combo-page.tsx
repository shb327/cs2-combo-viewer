import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmbedStatus } from '@/components/embed/embed-status'
import { FrozenFrame } from '@/components/embed/frozen-frame'
import { ASSET_LAYOUT } from '@/lib/asset-layout'
import { ASSET_BASE } from '@/lib/config'
import { loadAgents, type AgentIndex } from '@/lib/data/agents'
import { loadIndex, type CatalogIndex } from '@/lib/data/catalog'
import {
  COMBO_KEYS, COMBO_VERSION, comboFromParams, parseView, resolveCombo,
  type ComboErrorCode, type ComboInput, type ComboView, type NormalizedCombo,
} from '@/lib/embed/combo'
import { asComboCommand, ComboChannel, type ComboEvent, type ComboStatus } from '@/lib/embed/combo-protocol'
import type { ComboRunner } from '@/lib/embed/combo-runner'
import { hasWebGL2 } from '@/lib/embed/webgl'

/** What the page asked for last: the combo, the view, the command's id and when it came. */
interface Request { id: string | null; input: ComboInput; view: ComboView; started: number }

interface Shown { status: ComboStatus | 'idle'; error: string; combo: NormalizedCombo | null }

/** One channel per page (React may mount the page twice in development). */
let channel: ComboChannel | null = null
const WEBGL2 = typeof document !== 'undefined' && hasWebGL2()
const post = (event: ComboEvent) => channel!.post(event)

/**
 * The combo embed (docs/embed.md): a knife in gloves on an agent's arms, in first person, by the game's indexes,
 * driven by its URL and by postMessage from the allowed origins.
 */
export function ComboPage() {
  const [search] = useSearchParams()
  const [initial] = useState(() => ({
    input: comboFromParams(search),
    view: parseView(search.get('view')),
    hasCombo: COMBO_KEYS.some((k) => search.has(k)),
    ui: search.get('ui') !== '0',
    debug: search.get('debug') === '1',
  }))
  channel ??= new ComboChannel(() => ({ type: 'cs3d:ready', version: COMBO_VERSION, release: ASSET_LAYOUT.release, webgl2: WEBGL2 }))

  const container = useRef<HTMLDivElement>(null)
  const runner = useRef<ComboRunner | null>(null)
  const [runnerReady, setRunnerReady] = useState(false)
  const [data, setData] = useState<{ catalog: CatalogIndex; agents: AgentIndex } | null>(null)
  const [request, setRequest] = useState<Request | null>(() => (initial.hasCombo || search.has('view') ? { id: null, input: initial.input, view: initial.view ?? 'fp', started: 0 } : null))
  const [shown, setShown] = useState<Shown>({ status: 'idle', error: '', combo: null })
  const [share, setShare] = useState(0)
  const [frozen, setFrozen] = useState<{ canvas: HTMLCanvasElement; thawing: boolean } | null>(null)
  const latest = useRef({ request, shown })
  latest.current = { request, shown }

  const fail = (id: string | null, code: ComboErrorCode, message: string, retryable: boolean) => {
    setShown((s) => ({ ...s, status: 'error', error: message }))
    setFrozen(null)
    post({ type: 'cs3d:error', id, code, message, retryable })
  }

  // No WebGL2: said at once, before anything heavy is fetched.
  useEffect(() => {
    if (!WEBGL2) fail(null, 'no-webgl2', 'This browser can\'t show 3D (WebGL2 isn\'t available).', false)
    else if (initial.view === null) fail(null, 'bad-params', 'view must be fp or orbit.', false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The catalog and the agents (once), next to the viewer's start.
  useEffect(() => {
    if (!WEBGL2) return
    Promise.all([loadIndex(ASSET_BASE), loadAgents(ASSET_BASE)])
      .then(([catalog, agents]) => setData({ catalog, agents }))
      .catch((e: Error) => fail(latest.current.request?.id ?? null, 'assets-unavailable', `The catalog couldn't be loaded: ${e.message}`, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The viewer (three.js is fetched only here, with WebGL2).
  useEffect(() => {
    if (!WEBGL2 || !container.current) return
    let cancelled = false
    let created: ComboRunner | null = null
    const el = container.current
    void import('@/lib/embed/combo-runner').then(({ ComboRunner }) => {
      if (cancelled) return
      const id = () => latest.current.request?.id ?? null
      created = new ComboRunner(el, {
        progress: (loaded, total) => {
          setShare((s) => (total ? Math.max(s, Math.min(0.98, loaded / total)) : s))
          post({ type: 'cs3d:progress', id: id(), loaded, total })
        },
        loaded: () => {
          const req = latest.current.request
          const combo = latest.current.shown.combo
          setShown((s) => ({ ...s, status: 'loaded', error: '' }))
          setFrozen((f) => (f ? { ...f, thawing: true } : null))
          window.setTimeout(() => setFrozen((f) => (f?.thawing ? null : f)), 400)
          if (req && combo) post({ type: 'cs3d:loaded', id: req.id, combo, view: req.view, release: ASSET_LAYOUT.release, ms: Math.round(performance.now() - req.started) })
        },
        error: (code, message, retryable) => fail(id(), code, message, retryable),
        recovering: (attempt) => {
          setShown((s) => ({ ...s, status: 'loading', error: '' }))
          setShare(0)
          post({ type: 'cs3d:recovering', id: id(), reason: 'context-lost', attempt })
        },
      })
      runner.current = created
      if (initial.debug) Object.assign(window, { __comboRunner: created })
      setRunnerReady(true)
    })
    return () => {
      cancelled = true
      created?.dispose()
      runner.current = null
      setRunnerReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Each request: checked against the catalog, then loaded.
  useEffect(() => {
    const r = runner.current
    if (!request || !data || !r || !runnerReady) return
    const resolved = resolveCombo(request.input, data.catalog, data.agents)
    if ('code' in resolved) {
      r.unload()
      setShown({ status: 'error', error: resolved.message, combo: null })
      fail(request.id, resolved.code, resolved.message, false)
      return
    }
    setShown({ status: 'loading', error: '', combo: resolved.combo })
    setShare(0)
    r.load(resolved, request.view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, data, runnerReady])

  // Commands from the parent page (allowed origins only).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const command = asComboCommand(e)
      if (!command) return
      const id = command.id ?? null
      const { request: current, shown: now } = latest.current
      const next = (input: ComboInput, view: ComboView) => {
        const snapshot = now.status === 'loaded' ? runner.current?.snapshot() : null
        if (snapshot) setFrozen({ canvas: snapshot, thawing: false })
        setRequest({ id, input, view, started: performance.now() })
      }
      switch (command.type) {
        case 'cs3d:load': {
          if (!WEBGL2) { fail(id, 'no-webgl2', 'This browser can\'t show 3D (WebGL2 isn\'t available).', false); break }
          const view = command.view === undefined ? current?.view ?? 'fp' : parseView(command.view)
          if (!view) { fail(id, 'bad-params', 'view must be fp or orbit.', false); break }
          next(command.combo, view)
          break
        }
        case 'cs3d:setView': {
          const view = parseView(command.view)
          if (!view) { fail(id, 'bad-params', 'view must be fp or orbit.', false); break }
          if (current) next(current.input, view)
          break
        }
        case 'cs3d:inspect':
          runner.current?.inspect()
          break
        case 'cs3d:getState':
          post({ type: 'cs3d:state', id, status: now.status === 'idle' ? 'loading' : now.status, combo: now.combo, view: current?.view ?? 'fp', release: ASSET_LAYOUT.release, loadId: current?.id ?? null })
          break
        case 'cs3d:loseContext':
          if (initial.debug) runner.current?.loseContext()
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loading = shown.status === 'loading'
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <div ref={container} className="absolute inset-0" />
      {frozen && <FrozenFrame canvas={frozen.canvas} thawing={frozen.thawing} />}
      {initial.ui && <EmbedStatus loading={loading && !frozen} error={shown.error} />}
      {loading && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[3px] bg-black/30" role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
          <div className="h-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, share * 100)}%` }} />
        </div>
      )}
    </main>
  )
}

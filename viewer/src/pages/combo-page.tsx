import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmbedStatus } from '@/components/embed/embed-status'
import { FrozenFrame } from '@/components/embed/frozen-frame'
import { ASSET_LAYOUT } from '@/lib/asset-layout'
import { ASSET_BASE } from '@/lib/config'
import { DEFAULT_AGENT, loadAgents, type AgentIndex } from '@/lib/data/agents'
import { loadIndex, VIEWER_DATA, type CatalogIndex } from '@/lib/data/catalog'
import {
  COMBO_FEATURES, COMBO_KEYS, COMBO_VERSION, comboFromParams, comboMaps, DEFAULT_MAP, parseMap, parseView, resolveCombo, sameItems,
  type ComboError, type ComboErrorCode, type ComboInput, type ComboMap, type ComboView, type NormalizedCombo,
} from '@/lib/embed/combo'
import { asComboCommand, ComboChannel, type ComboEvent, type ComboStatus } from '@/lib/embed/combo-protocol'
import type { ComboRunner } from '@/lib/embed/combo-runner'
import { takeMessages } from '@/lib/embed/early-messages'
import { hasWebGL2 } from '@/lib/embed/webgl'

/** What the page asked for last: the combo, the view, the map (as sent), the command's id and when it came. */
interface Request { id: string | null; input: ComboInput; view: ComboView; map: unknown; started: number }

/** What the page shows (or loads): its status, and the combo, view and map of the request it belongs to. */
interface Shown { status: ComboStatus | 'idle'; error: string; combo: NormalizedCombo | null; view: ComboView; map: string; loadId: string | null }

/** The fixed frame of `capture=1` (CSS pixels, drawn at pixel ratio 1): the size of Combo Skin's screenshots. */
export const CAPTURE_SIZE = { width: 1920, height: 1080 } as const

/** The maps a visitor may choose and the built agents, for `cs3d:ready` and the checks (fetched once). */
interface Lists { maps: ComboMap[]; agents: AgentIndex | null }

let lists: Promise<Lists> | null = null
const loadLists = (): Promise<Lists> => (lists ??= Promise.all([
  fetch(ASSET_BASE + VIEWER_DATA + 'maps.json').then((r) => (r.ok ? r.json() : [])).then((m) => comboMaps(Array.isArray(m) ? m : [])).catch(() => []),
  loadAgents(ASSET_BASE).catch(() => null),
]).then(([maps, agents]) => ({ maps, agents })))

/** The default map: Vertigo, when it is on offer. */
const defaultMapOf = (maps: ComboMap[]) => (maps.some((m) => m.id === DEFAULT_MAP) || !maps.length ? DEFAULT_MAP : maps[0].id)

/** `cs3d:ready`, once the lists are in (empty when they couldn't be loaded: `cs3d:error` follows with the load). */
async function readyEvent(): Promise<ComboEvent> {
  const { maps, agents } = await loadLists()
  return {
    type: 'cs3d:ready', version: COMBO_VERSION, release: ASSET_LAYOUT.release, webgl2: WEBGL2,
    features: [...COMBO_FEATURES], maps, defaultMap: defaultMapOf(maps),
    agents: agents ? agents.agents.map((a) => a.index).filter((i) => i > 0) : [],
    defaultAgent: agents?.agent.get(DEFAULT_AGENT)?.index ?? 5404,
  }
}

/** One channel per page (React may mount the page twice in development). */
let channel: ComboChannel | null = null
const WEBGL2 = typeof document !== 'undefined' && hasWebGL2()
const post = (event: ComboEvent) => channel!.post(event)

/**
 * The combo embed (docs/embed.md): a knife in gloves on an agent's arms, in first person, by the game's indexes, on one
 * of the maps, driven by its URL and by postMessage from the allowed origins.
 */
export function ComboPage() {
  const [search] = useSearchParams()
  const [initial] = useState(() => ({
    input: comboFromParams(search),
    view: parseView(search.get('view')),
    map: search.get('map'),
    hasCombo: COMBO_KEYS.some((k) => search.has(k)),
    ui: search.get('ui') !== '0' && search.get('capture') !== '1',
    debug: search.get('debug') === '1',
    capture: search.get('capture') === '1',
    /** `input=game`: the game's mouse buttons and keys in first person; the mouse never moves the view. */
    gameInput: search.get('input') === 'game',
  }))
  channel ??= new ComboChannel(readyEvent)

  const container = useRef<HTMLDivElement>(null)
  const runner = useRef<ComboRunner | null>(null)
  const [runnerReady, setRunnerReady] = useState(false)
  const [data, setData] = useState<{ catalog: CatalogIndex; agents: AgentIndex; maps: ComboMap[] } | null>(null)
  const [request, setRequest] = useState<Request | null>(() => (initial.hasCombo || search.has('view') || search.has('map')
    ? { id: null, input: initial.input, view: initial.view ?? 'fp', map: initial.map, started: 0 } : null))
  const [shown, setShown] = useState<Shown>({ status: 'idle', error: '', combo: null, view: 'fp', map: DEFAULT_MAP, loadId: null })
  const [share, setShare] = useState(0)
  const [frozen, setFrozen] = useState<{ canvas: HTMLCanvasElement; thawing: boolean } | null>(null)
  /** What was on screen when the last scene was drawn: shown again when a change of agent or map fails. */
  const drawn = useRef<Shown | null>(null)
  const latest = useRef({ request, shown })
  latest.current = { request, shown }

  const thaw = () => {
    setFrozen((f) => (f ? { ...f, thawing: true } : null))
    window.setTimeout(() => setFrozen((f) => (f?.thawing ? null : f)), 400)
  }

  const fail = (id: string | null, code: ComboErrorCode, message: string, retryable: boolean) => {
    setShown((s) => ({ ...s, status: 'error', error: message }))
    setFrozen(null)
    post({ type: 'cs3d:error', id, code, message, retryable, kept: false })
  }

  /** An error that leaves the last drawn scene on screen (and says so): the page shows it as it was. */
  const failKept = (id: string | null, code: ComboErrorCode, message: string, retryable: boolean) => {
    if (drawn.current) setShown(drawn.current)
    post({ type: 'cs3d:error', id, code, message, retryable, kept: true })
  }

  // No WebGL2: said at once, before anything heavy is fetched.
  useEffect(() => {
    if (!WEBGL2) fail(null, 'no-webgl2', 'This browser can\'t show 3D (WebGL2 isn\'t available).', false)
    else if (initial.view === null) fail(null, 'bad-params', 'view must be fp or orbit.', false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The catalog, the agents and the maps (once), next to the viewer's start.
  useEffect(() => {
    if (!WEBGL2) return
    Promise.all([loadIndex(ASSET_BASE), loadAgents(ASSET_BASE), loadLists()])
      .then(([catalog, agents, { maps }]) => setData({ catalog, agents, maps }))
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
          const now = latest.current.shown
          const done: Shown = { ...now, status: 'loaded', error: '' }
          drawn.current = done
          setShown(done)
          thaw()
          if (req && now.combo) post({ type: 'cs3d:loaded', id: req.id, combo: now.combo, view: now.view, map: now.map, release: ASSET_LAYOUT.release, ms: Math.round(performance.now() - req.started) })
        },
        error: (code, message, retryable, kept) => (kept ? failKept(id(), code, message, retryable) : fail(id(), code, message, retryable)),
        restored: thaw,
        recovering: (attempt) => {
          setShown((s) => ({ ...s, status: 'loading', error: '' }))
          setShare(0)
          post({ type: 'cs3d:recovering', id: id(), reason: 'context-lost', attempt })
        },
        captureReady: () => {
          const req = latest.current.request
          const combo = latest.current.shown.combo
          if (req && combo) post({ type: 'cs3d:captureReady', id: req.id, combo, release: ASSET_LAYOUT.release })
        },
      }, { capture: initial.capture, gameInput: initial.gameInput })
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

  // Each request: checked against the catalog and the maps, then loaded.
  useEffect(() => {
    const r = runner.current
    if (!request || !data || !r || !runnerReady) return
    const before = r.drawn
    const resolved = resolveCombo(request.input, data.catalog, data.agents)
    const map = parseMap(request.map, data.maps, defaultMapOf(data.maps))
    if ('code' in resolved || typeof map !== 'string') {
      const problem = 'code' in resolved ? resolved : map as ComboError
      /** The same knife and gloves as on screen (only the agent or the map was wrong): the scene stays. */
      const items = resolveCombo({ ...request.input, agent: undefined }, data.catalog, data.agents)
      if (before && before.view === request.view && !('code' in items) && sameItems(items, before.combo)) {
        thaw()
        failKept(request.id, problem.code, problem.message, false)
        return
      }
      r.unload()
      drawn.current = null
      setShown((s) => ({ ...s, status: 'error', error: problem.message, combo: null, view: request.view, loadId: request.id }))
      fail(request.id, problem.code, problem.message, false)
      return
    }
    const mapId = map as string
    setShown({ status: 'loading', error: '', combo: resolved.combo, view: request.view, map: mapId, loadId: request.id })
    setShare(0)
    const keep = before && before.view === request.view && sameItems(resolved, before.combo) ? before : null
    r.load({ combo: resolved, view: request.view, map: mapId }, { keep })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, data, runnerReady])

  // Commands from the parent page (allowed origins only).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const command = asComboCommand(e)
      if (!command) return
      const id = command.id ?? null
      const { request: current, shown: now } = latest.current
      const next = (input: ComboInput, view: ComboView, map: unknown) => {
        const snapshot = now.status === 'loaded' ? runner.current?.snapshot() : null
        if (snapshot) setFrozen({ canvas: snapshot, thawing: false })
        setRequest({ id, input, view, map, started: performance.now() })
      }
      switch (command.type) {
        case 'cs3d:load': {
          if (!WEBGL2) { fail(id, 'no-webgl2', 'This browser can\'t show 3D (WebGL2 isn\'t available).', false); break }
          const view = command.view === undefined ? current?.view ?? 'fp' : parseView(command.view)
          if (!view) { fail(id, 'bad-params', 'view must be fp or orbit.', false); break }
          next(command.combo, view, command.map)
          break
        }
        case 'cs3d:setView': {
          const view = parseView(command.view)
          if (!view) { fail(id, 'bad-params', 'view must be fp or orbit.', false); break }
          if (current) next(current.input, view, current.map)
          break
        }
        case 'cs3d:inspect':
          runner.current?.inspect()
          break
        case 'cs3d:getState':
          if (now.status === 'idle') post({ type: 'cs3d:state', id, status: 'loading', combo: null, view: current?.view ?? 'fp', map: DEFAULT_MAP, release: ASSET_LAYOUT.release, loadId: current?.id ?? null })
          else post({ type: 'cs3d:state', id, status: now.status, combo: now.combo, view: now.view, map: now.map, release: ASSET_LAYOUT.release, loadId: now.loadId })
          break
        case 'cs3d:capture': {
          /** A refused capture leaves the combo shown as it is: only the command's error. */
          const refuse = (code: ComboErrorCode, message: string, retryable: boolean, kept: boolean) => post({ type: 'cs3d:error', id, code, message, retryable, kept })
          const shownNow = now.status === 'loaded'
          if (!initial.capture) { refuse('bad-params', "cs3d:capture needs the page's capture=1.", false, shownNow); break }
          const combo = now.combo
          if (!shownNow || !combo) { refuse('bad-params', 'Nothing to capture: no combo is loaded.', false, false); break }
          void runner.current?.capture().then((shot) => {
            if (shot) post({ type: 'cs3d:captured', id, ...shot, combo, release: ASSET_LAYOUT.release })
            else refuse('context-lost', "The frame couldn't be read (the view is gone).", true, false)
          })
          break
        }
        case 'cs3d:loseContext':
          if (initial.debug) runner.current?.loseContext()
          break
      }
    }
    return takeMessages(onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // input=game: the game's mouse buttons and keys. Only a mouse plays swings; touch and pen do nothing.
  useEffect(() => {
    if (!initial.gameInput) return
    const el = container.current
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      // The document takes the keyboard's focus, so F works after a click.
      window.focus()
      if (e.button === 0) runner.current?.swing('light')
      else if (e.button === 2) runner.current?.swing('heavy')
    }
    const onContextMenu = (e: Event) => e.preventDefault()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        // Not acted on here: the page decides (it closes its window, for example).
        e.preventDefault()
        post({ type: 'cs3d:key', id: null, key: 'Escape' })
      } else if (e.code === 'KeyF' && !e.repeat) {
        e.preventDefault()
        runner.current?.inspect()
      }
    }
    el?.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      el?.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loading = shown.status === 'loading'
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <div ref={container} className="absolute inset-0" style={initial.capture ? { right: 'auto', bottom: 'auto', ...CAPTURE_SIZE } : undefined} />
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

// Draws combos in one Chrome page kept open between shots: the combo embed at /combo?capture=1, driven with its own
// messages (docs/embed.md, "Capturing"). Chrome is started when there is work and closed after `idleMs` without any
// (its profile, with the HTTP and shader caches, stays on disk); one that dies is started again.
import { launchChrome } from './chrome.mjs'
import { EMBED_ERRORS, SHOT } from './job.mjs'
import { RenderError } from './worker.mjs'

const BINDING = '__cs3dWorker'
const READY_TIMEOUT_MS = 30_000
/** Starting Chrome: this many tries, this long apart, before the worker gives up (exit 5). */
export const LAUNCH_TRIES = 3
export const LAUNCH_PAUSE_MS = 10_000
/** Below this share of the frame drawn by the 3D view, the capture is taken for a cleared frame. */
const MIN_COVERAGE = 0.01

/**
 * Runs in the page before its own scripts: passes every embed event (the page isn't framed, so they come as `cs3d`
 * DOM events) to the worker through the binding, the PNG as base64.
 */
const PAGE_HOOK = `(() => {
  const send = (m) => globalThis.${BINDING}(JSON.stringify(m))
  addEventListener('cs3d', async (e) => {
    const m = e.detail
    if (!m || typeof m.type !== 'string') return
    if (m.type !== 'cs3d:captured') return send(m)
    const bytes = new Uint8Array(await m.png.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    send({ ...m, png: btoa(s) })
  })
})()`

/** The WebGL renderer's name, to log which GPU draws (and to warn about a software one). */
const GPU_QUERY = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2')
  if (!gl) return null
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return name
})()`

/** A wait made before the command it waits on: it may fail (a stop, a crash) before it is awaited. */
const handled = (promise) => { promise.catch(() => {}); return promise }

const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve()
  const t = setTimeout(done, ms)
  function done() { clearTimeout(t); signal?.removeEventListener('abort', done); resolve() }
  signal?.addEventListener('abort', done, { once: true })
})

/**
 * @param {object} opts
 * @param {string} opts.viewerUrl
 * @param {string} opts.release
 * @param {string} opts.chromePath
 * @param {string} opts.profileDir
 * @param {ReturnType<import('./log.mjs').createLog>} opts.log
 * @param {number | null} [opts.idleMs] close the browser after this long without a render (null: keep it open)
 * @param {typeof launchChrome} [opts.launch]
 * @param {number} [opts.launchTries]
 * @param {number} [opts.launchPauseMs]
 */
export function createRenderer({ viewerUrl, release, chromePath, profileDir, log, idleMs = null, launch = launchChrome, launchTries = LAUNCH_TRIES, launchPauseMs = LAUNCH_PAUSE_MS }) {
  let chrome = null
  let page = null
  let idleTimer = null
  /** An idle close in progress: a render waits for it before starting a new browser. */
  let closing = null
  let busy = false
  let starting = false

  const alive = () => chrome !== null && !chrome.cdp.closed

  /** Forgets the browser and closes it (killed if it doesn't go); never throws. */
  async function dropBrowser() {
    const c = chrome
    chrome = null
    page?.off()
    page = null
    if (c) { try { await c.close() } catch { /* gone */ } }
  }

  /** Starts Chrome and opens the page: a few tries, a pause between them; then a fatal error (exit 5). */
  async function startBrowser(signal) {
    starting = true
    try { return await startBrowserTries(signal) } finally { starting = false }
  }

  async function startBrowserTries(signal) {
    for (let attempt = 1; ; attempt++) {
      const started = Date.now()
      try {
        const c = await launch({ chromePath, profileDir, onStale: (pid) => log.warn('stopped a browser left on the profile', { pid }) })
        chrome = c
        c.cdp.on((m) => {
          if (m.method !== 'cdp.closed' || chrome !== c) return
          log.warn('the browser closed', { pid: c.pid })
          // During a render, the render sees it and starts another; between renders, the next one will.
          if (!busy && !starting) void dropBrowser()
        })
        const p = await openPage(signal)
        const gpu = (await p.send('Runtime.evaluate', { expression: GPU_QUERY, returnByValue: true })).result?.value
        log.info('browser ready', { gpu, pid: c.pid, ms: Date.now() - started, release, viewer: viewerUrl })
        if (/swiftshader|llvmpipe|software/i.test(gpu ?? '')) log.warn('WebGL runs on a software renderer: shots will be slow and may differ')
        return { gpu }
      } catch (e) {
        await dropBrowser()
        if (e.fatal || signal?.aborted) throw e
        if (attempt >= launchTries) {
          throw new RenderError('render_failed', `Chrome can't be started (${attempt} tries): ${e.message}`, { fatal: true, release: 'shutting_down', exitCode: 5 })
        }
        log.warn('browser start failed, trying again', { error: e.message, try: attempt, in_s: launchPauseMs / 1000 })
        await sleep(launchPauseMs, signal)
        if (signal?.aborted) throw new RenderError('render_failed', 'stopping')
      }
    }
  }

  function clearIdle() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
  }

  /** After a render (or the start), the browser is closed if no render comes within `idleMs`. */
  function scheduleIdle() {
    clearIdle()
    if (idleMs == null || busy || !chrome) return
    idleTimer = setTimeout(() => {
      idleTimer = null
      if (busy || !chrome) return
      log.info('browser closed: idle', { idle_s: idleMs / 1000, pid: chrome.pid })
      closing = dropBrowser().finally(() => { closing = null })
    }, idleMs)
    idleTimer.unref?.()
  }

  /** A fresh page on the embed, waiting for `cs3d:ready` (or the stop signal). */
  async function openPage(signal) {
    if (page) await closePage()
    const { cdp } = chrome
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const send = (method, params) => cdp.send(method, params, sessionId)
    const waiters = new Set()
    const p = { cdp, targetId, sessionId, send, waiters, crashed: false, off: null }
    p.off = cdp.on((m) => {
      if (m.method === 'cdp.closed' || (m.sessionId === sessionId && m.method === 'Inspector.targetCrashed') ||
          (m.method === 'Target.detachedFromTarget' && m.params.sessionId === sessionId)) {
        p.crashed = true
        for (const w of waiters) w({ type: 'worker:crashed' })
        return
      }
      if (m.sessionId !== sessionId) return
      if (m.method === 'Runtime.bindingCalled' && m.params.name === BINDING) {
        let event
        try { event = JSON.parse(m.params.payload) } catch { return }
        for (const w of waiters) w(event)
      } else if (m.method === 'Runtime.exceptionThrown') {
        log.warn('page exception', { text: m.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails?.text })
      }
    })
    page = p
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Inspector.enable')
    await send('Runtime.addBinding', { name: BINDING })
    await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HOOK })
    await send('Emulation.setDeviceMetricsOverride', { width: SHOT.width, height: SHOT.height, deviceScaleFactor: 1, mobile: false })
    const ready = handled(waitFor(p, (e) => e.type === 'cs3d:ready', READY_TIMEOUT_MS, signal))
    await send('Page.navigate', { url: `${viewerUrl}/combo?capture=1` })
    const r = await ready
    if (!r.webgl2) throw new RenderError('render_failed', 'this browser has no WebGL2', { fatal: true, release: 'gpu_unavailable' })
    if (r.release !== release) throw new RenderError('render_failed', `the viewer reports release ${r.release}, the build was made for ${release}`, { fatal: true, release: 'shutting_down' })
    return p
  }

  async function closePage() {
    const p = page
    page = null
    if (!p) return
    p.off()
    try { await p.cdp.send('Target.closeTarget', { targetId: p.targetId }) } catch { /* gone */ }
  }

  /**
   * The first event `match` accepts; rejects with a RenderError on a timeout, a crash or the stop signal.
   */
  function waitFor(p, match, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
      const done = (fn, v) => { clearTimeout(timer); p.waiters.delete(onEvent); signal?.removeEventListener('abort', onAbort); fn(v) }
      const onEvent = (e) => {
        if (e.type === 'worker:crashed') done(reject, new RenderError('render_failed', 'the page crashed'))
        else if (match(e)) done(resolve, e)
      }
      const onAbort = () => done(reject, new RenderError('render_failed', 'stopping'))
      const timer = setTimeout(() => done(reject, Object.assign(new RenderError('timeout', `no answer from the viewer in ${Math.round(timeoutMs / 1000)} s`), { timedOut: true })), timeoutMs)
      if (p.crashed) return onEvent({ type: 'worker:crashed' })
      if (signal?.aborted) return onAbort()
      p.waiters.add(onEvent)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Posts a command to the page as its parent would (the page's own origin, which is on the embed's list). */
  const command = (p, message) => p.send('Runtime.evaluate', { expression: `window.postMessage(${JSON.stringify(message)}, location.origin)` })

  /** One try: load, wait for the final frame, capture. */
  async function attempt(p, combo, id, deadline, signal) {
    const left = () => Math.max(1, deadline - Date.now())
    const isOurs = (e) => e.id === id
    const ready = handled(waitFor(p, (e) => isOurs(e) && (e.type === 'cs3d:captureReady' || e.type === 'cs3d:error'), left(), signal))
    await command(p, { type: 'cs3d:load', id, combo, view: 'fp' })
    const r = await ready
    if (r.type === 'cs3d:error') return { error: r }
    const shot = handled(waitFor(p, (e) => isOurs(e) && (e.type === 'cs3d:captured' || e.type === 'cs3d:error'), left(), signal))
    await command(p, { type: 'cs3d:capture', id })
    const c = await shot
    if (c.type === 'cs3d:error') return { error: c }
    if (c.width !== SHOT.width || c.height !== SHOT.height) throw new RenderError('render_failed', `the viewer drew ${c.width}x${c.height}`)
    if (!(c.coverage >= MIN_COVERAGE)) throw new RenderError('render_failed', `the frame is blank (the 3D view covers ${c.coverage} of it)`)
    if (c.release !== release) throw new RenderError('render_failed', `drawn with release ${c.release}, not ${release}`)
    return { png: Buffer.from(c.png, 'base64'), release: c.release, coverage: c.coverage, combo: c.combo }
  }

  return {
    /** Starts the browser now (to check it: its GPU, WebGL2, the release); with `idleMs`, it closes when idle. */
    async start() {
      clearIdle()
      if (closing) await closing
      const r = alive() ? { gpu: null } : await startBrowser()
      scheduleIdle()
      return r
    },

    /**
     * Draws one combo, starting the browser if it isn't open. A lost GPU context, a crash, files that wouldn't load
     * or a browser that died get one more try in a fresh page (a new browser for the last).
     * @returns {Promise<{ png: Buffer, release: string, coverage: number, ms: number }>}
     */
    async render(combo, { id, timeoutMs, signal }) {
      clearIdle()
      busy = true
      try {
        if (closing) await closing
        const started = Date.now()
        const deadline = started + timeoutMs
        for (let tries = 1; ; tries++) {
          let result
          try {
            if (!alive()) {
              if (chrome) await dropBrowser()
              await startBrowser(signal)
            } else if (!page || page.crashed) await openPage(signal)
            result = await attempt(page, combo, `${id}.${tries}`, deadline, signal)
          } catch (e) {
            if (signal?.aborted || e.fatal) throw e
            if (!alive()) {
              await dropBrowser()
              if (tries === 1 && Date.now() < deadline) {
                log.warn('the browser closed during a render, trying again in a new one', { job: id, detail: e.message })
                continue
              }
              throw new RenderError('render_failed', `the browser closed during the render (${e.message})`)
            }
            // A timeout or a crash leaves the page in an unknown state: the next job starts in a fresh one.
            if (e.timedOut || page?.crashed) await closePage()
            if (e instanceof RenderError && !e.timedOut && tries === 1 && Date.now() < deadline) {
              log.warn('render failed, trying again in a fresh page', { job: id, detail: e.message })
              await closePage()
              continue
            }
            throw e
          }
          if (result.error) {
            const { code, message } = result.error
            if (code === 'no-webgl2') throw new RenderError('render_failed', message, { fatal: true, release: 'gpu_unavailable' })
            const known = EMBED_ERRORS[code] ?? { reason: 'render_failed', retry: false }
            if (known.retry && tries === 1 && Date.now() < deadline) {
              log.warn('viewer error, trying again in a fresh page', { job: id, code })
              await closePage()
              continue
            }
            throw new RenderError(known.reason, `${code}: ${message}`)
          }
          return { ...result, ms: Date.now() - started }
        }
      } finally {
        busy = false
        if (chrome && chrome.cdp.closed) await dropBrowser()
        scheduleIdle()
      }
    },

    /** The page itself, for the checks: a screenshot of what the browser shows (to compare with the capture). */
    async pageScreenshot() {
      const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: SHOT.width, height: SHOT.height, scale: 1 } })
      return Buffer.from(r.data, 'base64')
    },

    async close() {
      clearIdle()
      if (closing) await closing
      try { if (alive()) await closePage() } catch { /* gone */ }
      await dropBrowser()
    },

    /** Whether a browser is open (for the checks). */
    get open() { return alive() },
  }
}

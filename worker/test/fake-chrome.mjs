// A stand-in for Chrome and its DevTools connection, enough for the renderer: pages on the combo embed that answer
// `cs3d:load` and `cs3d:capture` with a prepared frame. Each launch is a new browser that a test can kill.
import { drawnFrame } from './helpers.mjs'

const BINDING = '__cs3dWorker'
const tick = () => new Promise((r) => setImmediate(r))

/**
 * @param {{ release: string, png?: Buffer, onCommand?: (browser: object, message: object) => void, fail?: (n: number) => Error | null }} opts
 *   `onCommand` sees each embed command before the page answers (a test can kill the browser there); `fail` makes
 *   the n-th launch throw.
 */
export function fakeChrome({ release, png = drawnFrame(), onCommand, fail }) {
  const browsers = []
  let attempts = 0

  async function launch() {
    attempts++
    const error = fail?.(attempts)
    if (error) throw error
    const listeners = new Set()
    let targets = 0
    const emit = (m) => { for (const l of [...listeners]) l(m) }
    const browser = { n: browsers.length + 1, closed: false, closedBy: null, pages: 0 }
    const bind = (sessionId, event) => emit({ method: 'Runtime.bindingCalled', sessionId, params: { name: BINDING, payload: JSON.stringify(event) } })

    const cdp = {
      get closed() { return browser.closed },
      on(l) { listeners.add(l); return () => listeners.delete(l) },
      async send(method, params = {}, sessionId) {
        await tick()
        if (browser.closed) throw new Error('DevTools connection closed')
        if (method === 'Target.createTarget') { browser.pages++; return { targetId: `t${++targets}` } }
        if (method === 'Target.attachToTarget') return { sessionId: `s${params.targetId.slice(1)}` }
        if (method === 'Page.navigate') { setImmediate(() => !browser.closed && bind(sessionId, { type: 'cs3d:ready', webgl2: true, release })); return {} }
        if (method === 'Runtime.evaluate') {
          const m = /^window\.postMessage\((.*), location\.origin\)$/s.exec(params.expression)
          if (!m) return { result: { value: 'Fake GPU' } }
          const message = JSON.parse(m[1])
          onCommand?.(browser, message)
          if (browser.closed) return {}
          if (message.type === 'cs3d:load') setImmediate(() => !browser.closed && bind(sessionId, { type: 'cs3d:captureReady', id: message.id }))
          if (message.type === 'cs3d:capture') {
            setImmediate(() => !browser.closed && bind(sessionId, { type: 'cs3d:captured', id: message.id, width: 1920, height: 1080, coverage: 0.4, release, png: png.toString('base64'), combo: {} }))
          }
          return {}
        }
        return {}
      },
      close() { die('close') },
    }

    function die(by) {
      if (browser.closed) return
      browser.closed = true
      browser.closedBy = by
      emit({ method: 'cdp.closed', params: {} })
    }
    browser.kill = () => die('killed')
    browsers.push(browser)
    return { cdp, pid: 40000 + browser.n, close: async () => die(browser.closedBy ?? 'close') }
  }

  return {
    launch,
    browsers,
    get attempts() { return attempts },
    /** The browsers still open. */
    get open() { return browsers.filter((b) => !b.closed) },
  }
}

// Draws a knife alone, front and back, with the worker's own viewer build: the single-item embed (/embed) framed by a
// small host page on the viewer's origin, asked for `cs3d:screenshots` (the item alone, no background, cropped to
// what it covers). The studio's light, the knife standing up.
import { launchChrome } from '../chrome.mjs'

const BINDING = '__refcheck'
export const HOST_PATH = '/__refcheck/host'
export const HOST_PAGE = '<!doctype html><meta charset="utf-8"><title>refcheck</title>' +
  '<style>html,body{margin:0;background:#000}iframe{border:0;width:1000px;height:1000px;display:block}</style><iframe id="f"></iframe>'

/** In the host page (not the embed inside it): every `cs3d:` message from the embed to the binding, blobs as base64. */
const HOST_HOOK = `(() => {
  if (window.top !== window) return
  const b64 = async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }
  addEventListener('message', async (e) => {
    const m = e.data
    if (!m || typeof m.type !== 'string' || !m.type.startsWith('cs3d:')) return
    if (m.type === 'cs3d:screenshots') return globalThis.${BINDING}(JSON.stringify({ ...m, front: await b64(m.front), back: await b64(m.back) }))
    globalThis.${BINDING}(JSON.stringify(m))
  })
})()`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {{ viewerUrl: string, chromePath: string, profileDir: string, longSide?: number, timeoutMs?: number }} opts
 */
export function createSideRenderer({ viewerUrl, chromePath, profileDir, longSide = 1400, timeoutMs = 90_000 }) {
  let chrome = null
  let send = null
  const waiters = new Set()
  let seq = 0

  function waitFor(match, ms = timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(on); reject(new Error(`no answer from the viewer in ${ms / 1000} s`)) }, ms)
      const on = (e) => {
        if (e.type === 'refcheck:crashed') { clearTimeout(timer); waiters.delete(on); reject(new Error('the page crashed')) }
        else if (match(e)) { clearTimeout(timer); waiters.delete(on); resolve(e) }
      }
      waiters.add(on)
    })
  }

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result?.value
  }
  const post = (command) => evaluate(`document.getElementById('f').contentWindow.postMessage(${JSON.stringify(command)}, location.origin)`)

  async function openPage() {
    const { targetId } = await chrome.cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await chrome.cdp.send('Target.attachToTarget', { targetId, flatten: true })
    send = (method, params) => chrome.cdp.send(method, params, sessionId)
    chrome.cdp.on((m) => {
      if (m.method === 'cdp.closed' || (m.sessionId === sessionId && m.method === 'Inspector.targetCrashed')) {
        for (const w of [...waiters]) w({ type: 'refcheck:crashed' })
        return
      }
      if (m.sessionId !== sessionId || m.method !== 'Runtime.bindingCalled' || m.params.name !== BINDING) return
      let event
      try { event = JSON.parse(m.params.payload) } catch { return }
      for (const w of [...waiters]) w(event)
    })
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Inspector.enable')
    await send('Runtime.addBinding', { name: BINDING })
    await send('Page.addScriptToEvaluateOnNewDocument', { source: HOST_HOOK })
    await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1000, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: viewerUrl + HOST_PATH })
    await sleep(300)
    const ready = waitFor((e) => e.type === 'cs3d:ready')
    await evaluate(`document.getElementById('f').src = '/embed?bg=transparent&ui=0&knife_pose=vertical&quality=max'`)
    await ready
  }

  return {
    async start() {
      chrome = await launchChrome({ chromePath, profileDir })
      await openPage()
    },

    /**
     * One knife finish at a float and seed, both sides.
     * @param {{ item: string, kit: string, float: number, seed: number }} skin
     * @returns {Promise<{ front: Buffer, back: Buffer }>}
     */
    async render({ item, kit, float, seed }) {
      const loaded = waitFor((e) => e.type === 'cs3d:loaded' || e.type === 'cs3d:error')
      await post({ type: 'cs3d:load', target: { skin: `${item}|${kit}` }, options: { float, seed, knife_pose: 'vertical' } })
      const r = await loaded
      if (r.type === 'cs3d:error') throw new Error(`${item}|${kit}: ${r.message}`)
      if (r.item?.id !== `${item}|${kit}`) throw new Error(`the viewer loaded ${r.item?.id}, not ${item}|${kit}`)
      // Let the composite and the texture uploads finish (they happen over the first frames).
      await evaluate(`new Promise((resolve) => { const w = document.getElementById('f').contentWindow; let n = 0; const f = () => (++n >= 30 ? resolve() : w.requestAnimationFrame(f)); w.requestAnimationFrame(f) })`)
      await sleep(250)
      const id = `s${++seq}`
      const shot = waitFor((e) => e.type === 'cs3d:screenshots' && e.id === id)
      await post({ type: 'cs3d:screenshots', id, longSide })
      const s = await shot
      return { front: Buffer.from(s.front, 'base64'), back: Buffer.from(s.back, 'base64') }
    },

    async close() {
      if (chrome) await chrome.close()
      chrome = null
    },
  }
}

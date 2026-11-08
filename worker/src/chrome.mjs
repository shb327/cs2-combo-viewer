// Chrome, headless, with its own profile, driven over the DevTools protocol (Node's own WebSocket, no packages).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The flags: headless, the GPU on (never the software renderer by choice), nothing that syncs or phones home. */
export function chromeArgs(profileDir, { width = 1920, height = 1080 } = {}) {
  return [
    '--headless=new',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    `--window-size=${width},${height}`,
    '--enable-gpu', '--ignore-gpu-blocklist',
    ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--mute-audio',
    '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    'about:blank',
  ]
}

/**
 * Starts Chrome and connects to it.
 * @returns {Promise<{ cdp: Cdp, close: () => Promise<void>, pid: number }>}
 */
export async function launchChrome({ chromePath, profileDir }) {
  if (!existsSync(chromePath)) throw new Error(`Chrome isn't at ${chromePath} (set CHROME_PATH).`)
  mkdirSync(profileDir, { recursive: true })
  const portFile = path.join(profileDir, 'DevToolsActivePort')
  rmSync(portFile, { force: true })
  const proc = spawn(chromePath, chromeArgs(profileDir), { stdio: 'ignore' })
  let exited = false
  const exit = new Promise((resolve) => proc.once('exit', () => { exited = true; resolve() }))
  proc.once('error', () => { exited = true })
  let wsUrl = null
  for (let i = 0; i < 150 && !wsUrl && !exited; i++) {
    await sleep(100)
    try {
      const [port, wsPath] = readFileSync(portFile, 'utf8').split(/\r?\n/)
      if (port && wsPath) wsUrl = `ws://127.0.0.1:${port}${wsPath}`
    } catch { /* not written yet */ }
  }
  if (!wsUrl) { proc.kill(); throw new Error(exited ? 'Chrome exited at start (is another worker using its profile?).' : 'Chrome did not open its DevTools port in 15 s.') }
  const cdp = await Cdp.connect(wsUrl)
  async function close() {
    if (!exited) {
      try { await Promise.race([cdp.send('Browser.close'), sleep(3000)]) } catch { /* already gone */ }
      await Promise.race([exit, sleep(5000)])
      if (!exited) { proc.kill(); await Promise.race([exit, sleep(3000)]) }
    }
    cdp.close()
  }
  return { cdp, close, pid: proc.pid }
}

/** The DevTools protocol over one WebSocket: commands (with a session for a page) and events. */
export class Cdp {
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error('DevTools connection failed')), { once: true })
    })
    return new Cdp(ws)
  }

  constructor(ws) {
    this.ws = ws
    this.next = 0
    this.pending = new Map()
    this.listeners = new Set()
    this.closed = false
    ws.addEventListener('message', (e) => this.onMessage(JSON.parse(e.data)))
    ws.addEventListener('close', () => {
      this.closed = true
      for (const { reject } of this.pending.values()) reject(new Error('DevTools connection closed'))
      this.pending.clear()
      for (const l of this.listeners) l({ method: 'cdp.closed', params: {} })
    })
  }

  onMessage(m) {
    if (m.id !== undefined) {
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id)
      if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`))
      else p.resolve(m.result)
      return
    }
    for (const l of this.listeners) l(m)
  }

  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('DevTools connection closed'))
    const id = ++this.next
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  /** Every event (`{ method, params, sessionId }`); returns the function that stops listening. */
  on(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close() {
    try { this.ws.close() } catch { /* closed */ }
  }
}

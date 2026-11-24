// Chrome, headless, with its own profile, driven over the DevTools protocol (Node's own WebSocket, no packages).
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
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

const running = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

/**
 * Stops a Chrome left running on this profile by a worker that didn't close it (killed, or crashed): it would keep
 * the profile, and a new Chrome on it would hand over to it and exit. Only a process whose command line names this
 * profile is stopped (the profile's SingletonLock names the pid; macOS and Linux).
 * @returns {Promise<number | null>} the pid stopped
 */
export async function freeProfile(profileDir) {
  if (process.platform === 'win32') return null
  let pid
  try { pid = Number(/-(\d+)$/.exec(readlinkSync(path.join(profileDir, 'SingletonLock')))?.[1]) } catch { return null }
  if (!pid || pid === process.pid || !running(pid)) return null
  let command = ''
  try { command = execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }) } catch { return null }
  if (!command.includes(`--user-data-dir=${profileDir}`)) return null
  for (const [signal, ms] of [['SIGTERM', 5000], ['SIGKILL', 3000]]) {
    try { process.kill(pid, signal) } catch { return pid }
    for (let t = 0; t < ms && running(pid); t += 100) await sleep(100)
    if (!running(pid)) return pid
  }
  return pid
}

/**
 * Starts Chrome and connects to it. When the browser exits, its connection is marked closed at once (`cdp.closed`,
 * and a `cdp.closed` event), so whatever waits on it learns that the browser is gone.
 * @returns {Promise<{ cdp: Cdp, close: () => Promise<void>, pid: number }>}
 */
export async function launchChrome({ chromePath, profileDir, onStale }) {
  if (!existsSync(chromePath)) throw new Error(`Chrome isn't at ${chromePath} (set CHROME_PATH).`)
  mkdirSync(profileDir, { recursive: true })
  const stale = await freeProfile(profileDir)
  if (stale) onStale?.(stale)
  const portFile = path.join(profileDir, 'DevToolsActivePort')
  rmSync(portFile, { force: true })
  const proc = spawn(chromePath, chromeArgs(profileDir), { stdio: 'ignore' })
  let exited = false
  let cdp = null
  const exit = new Promise((resolve) => proc.once('exit', () => { exited = true; cdp?.markClosed(); resolve() }))
  proc.once('error', () => { exited = true })
  let wsUrl = null
  for (let i = 0; i < 150 && !wsUrl && !exited; i++) {
    await sleep(100)
    try {
      const [port, wsPath] = readFileSync(portFile, 'utf8').split(/\r?\n/)
      if (port && wsPath) wsUrl = `ws://127.0.0.1:${port}${wsPath}`
    } catch { /* not written yet */ }
  }
  if (!wsUrl) { proc.kill('SIGKILL'); throw new Error(exited ? 'Chrome exited at start (is another worker using its profile?).' : 'Chrome did not open its DevTools port in 15 s.') }
  try { cdp = await Cdp.connect(wsUrl) } catch (e) { proc.kill('SIGKILL'); await Promise.race([exit, sleep(3000)]); throw e }
  if (exited) cdp.markClosed()
  /** Closes the browser: asked politely while its connection lasts, then SIGTERM, then SIGKILL, so the profile is free. */
  async function close() {
    if (!exited && !cdp.closed) {
      try { await Promise.race([cdp.send('Browser.close'), sleep(3000)]) } catch { /* already gone */ }
      await Promise.race([exit, sleep(5000)])
    }
    if (!exited) { proc.kill('SIGTERM'); await Promise.race([exit, sleep(3000)]) }
    if (!exited) { proc.kill('SIGKILL'); await Promise.race([exit, sleep(3000)]) }
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
    ws.addEventListener('close', () => this.markClosed())
  }

  /** The connection is gone (its socket closed, or the browser exited): pending commands fail, listeners are told. */
  markClosed() {
    if (this.closed) return
    this.closed = true
    for (const { reject } of this.pending.values()) reject(new Error('DevTools connection closed'))
    this.pending.clear()
    for (const l of [...this.listeners]) l({ method: 'cdp.closed', params: {} })
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
    this.markClosed()
  }
}

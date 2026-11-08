#!/usr/bin/env node
// The screenshot worker: `node src/main.mjs` keeps polling; `--once` stops when nothing is due (worker/README.md).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createApi } from './api.mjs'
import { ConfigError, readConfig } from './config.mjs'
import { createLog } from './log.mjs'
import { createRenderer } from './renderer.mjs'
import { PortInUseError, serveViewer } from './server.mjs'
import { createWorker, FatalError } from './worker.mjs'

/** The look of combos this worker draws; Combo Skin's RENDER_REVISION (screenshots/inputs.py) is raised with it. */
export const RENDER_REVISION = 1

const log = createLog()
const args = new Set(process.argv.slice(2))
for (const a of args) if (!['--once', '--help'].includes(a)) { console.error(`Unknown option ${a}. Usage: node src/main.mjs [--once]`); process.exit(2) }
if (args.has('--help')) { console.log('Usage: node src/main.mjs [--once]   (settings: worker/README.md)'); process.exit(0) }

let config
try { config = readConfig() } catch (e) {
  if (e instanceof ConfigError) { log.error(e.message); process.exit(2) }
  throw e
}

const dist = path.resolve(import.meta.dirname, '..', 'viewer-dist')
const buildFile = path.join(dist, 'worker-build.json')
if (!existsSync(buildFile)) { log.error('No viewer build: run "npm run build" in worker/ first.'); process.exit(2) }
const build = JSON.parse(readFileSync(buildFile, 'utf8'))
const { version } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8'))

let server = null
let renderer = null
let worker = null
let exitCode = 0
let signals = 0

async function shutdown() {
  try { await renderer?.close() } catch (e) { log.warn('browser close', { error: e.message }) }
  try { await server?.close() } catch { /* closed */ }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    signals++
    if (signals > 1) { log.warn('second signal: exiting now'); process.exit(130) }
    log.info('stopping: no new claims; the job in hand is released', { signal: sig })
    worker?.stop()
    if (!worker) void shutdown().then(() => process.exit(130))
  })
}

try {
  server = await serveViewer(dist)
  renderer = createRenderer({ viewerUrl: server.url, release: build.release, chromePath: config.chromePath, profileDir: config.profileDir, log })
  log.info('starting', { version, release: build.release, viewer_commit: build.commit, api: config.apiUrl, timeout_s: config.renderTimeoutMs / 1000 })
  await renderer.start()
  const api = createApi({ apiUrl: config.apiUrl, token: config.token, userAgent: `cs2-combo-worker/${version}` })
  worker = createWorker({ api, renderer, log, config: { ...config, renderRevision: RENDER_REVISION } })
  if (signals) worker.stop()
  const stats = await worker.run({ once: args.has('--once') })
  log.info('stopped', stats)
} catch (e) {
  if (e instanceof PortInUseError || e instanceof FatalError) { log.error(e.message); exitCode = e.exitCode ?? 3 }
  else if (e?.fatal) { log.error(`Stopping: ${e.message}`); exitCode = 4 }
  else { log.error('unexpected error', { error: e?.stack ?? String(e) }); exitCode = 1 }
} finally {
  await shutdown()
}
process.exit(signals && !exitCode ? 0 : exitCode)

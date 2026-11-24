// The browser's life: started again when it dies, given up on when it won't start, closed when there's no work.
// The real renderer and worker against the fake API, with a fake Chrome (test/fake-chrome.mjs).
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createApi } from '../src/api.mjs'
import { createRenderer } from '../src/renderer.mjs'
import { createWorker, FatalError } from '../src/worker.mjs'
import { fakeChrome } from './fake-chrome.mjs'
import { startFakeApi } from './fake-api.mjs'
import { memoryLog } from './helpers.mjs'

const RELEASE = '3de0d6e58111'
const config = { renderTimeoutMs: 60_000, pollIntervalMs: 5_000, renderRevision: 1 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fake, token

const addCombo = () => fake.addCombo({
  glove: { def_index: 5034, paint_index: 10033, float: 0.15, seed: 269 },
  knife: { def_index: 507, paint_index: 415, float: 0.01, seed: 1 },
  agent: { def_index: 5404 },
})

function setup(chrome, renderOpts = {}, workerConfig = {}) {
  const { log, lines } = memoryLog()
  const renderer = createRenderer({ viewerUrl: 'http://127.0.0.1:5321', release: RELEASE, chromePath: '/fake/chrome', profileDir: '/fake/profile', log, launch: chrome.launch, launchPauseMs: 20, ...renderOpts })
  const api = createApi({ apiUrl: fake.url, token: () => token })
  return { renderer, worker: createWorker({ api, renderer, log, config: { ...config, ...workerConfig } }), lines }
}

const types = () => fake.events.map((e) => e.type)

before(async () => { fake = await startFakeApi(); token = fake.addWorker('mac') })
beforeEach(() => fake.clear())
after(() => fake.close())

test('a browser that dies mid-job is started again: the job and the next one render', async () => {
  const a = addCombo(), b = addCombo()
  let loads = 0
  const chrome = fakeChrome({ release: RELEASE, onCommand: (browser, m) => { if (m.type === 'cs3d:load' && ++loads === 1) browser.kill() } })
  const { renderer, worker, lines } = setup(chrome)
  const stats = await worker.run({ once: true })
  await renderer.close()
  assert.deepEqual(stats, { stored: 2, failed: 0, dropped: 0, released: 0 })
  assert.deepEqual([...fake.stored.keys()].sort(), [a, b].sort())
  assert.equal(chrome.browsers.length, 2)
  assert.equal(chrome.browsers[0].closedBy, 'killed')
  assert.ok(lines.some((l) => /^warn the browser closed during a render, trying again in a new one/.test(l)))
})

test('a browser that dies twice in one job: that job is reported, the next renders in a new browser', async () => {
  const a = addCombo(), b = addCombo()
  let loads = 0
  const chrome = fakeChrome({ release: RELEASE, onCommand: (browser, m) => { if (m.type === 'cs3d:load' && ++loads <= 2) browser.kill() } })
  const { renderer, worker } = setup(chrome)
  const stats = await worker.run({ once: true })
  await renderer.close()
  assert.deepEqual(stats, { stored: 1, failed: 1, dropped: 0, released: 0 })
  const failed = fake.events.find((e) => e.type === 'failed')
  assert.equal(failed.combo, a)
  assert.equal(failed.reason, 'render_failed')
  assert.match(failed.detail, /the browser closed during the render/)
  assert.ok(fake.stored.has(b))
  assert.equal(chrome.browsers.length, 3)
})

test('a browser that dies while idle is replaced at the next job, with no failure', async () => {
  const chrome = fakeChrome({ release: RELEASE })
  const { renderer, worker, lines } = setup(chrome)
  await renderer.start()
  chrome.browsers[0].kill()
  await sleep(10)
  assert.ok(lines.some((l) => /^warn the browser closed/.test(l)))
  const id = addCombo()
  const stats = await worker.run({ once: true })
  await renderer.close()
  assert.deepEqual(stats, { stored: 1, failed: 0, dropped: 0, released: 0 })
  assert.ok(fake.stored.has(id))
  assert.equal(chrome.browsers.length, 2)
})

test('Chrome that won\'t start again: a few tries with a pause, the job released, exit 5', async () => {
  const id = addCombo()
  const chrome = fakeChrome({ release: RELEASE, fail: () => new Error('Chrome exited at start') })
  const { worker, lines } = setup(chrome, { launchTries: 3, launchPauseMs: 50 })
  const started = Date.now()
  await assert.rejects(worker.run({ once: true }), (e) => e instanceof FatalError && e.exitCode === 5 && /Chrome can't be started/.test(e.message))
  assert.equal(chrome.attempts, 3)
  assert.ok(Date.now() - started >= 100, 'pauses between the tries')
  assert.equal(lines.filter((l) => /^warn browser start failed, trying again/.test(l)).length, 2)
  const released = fake.events.find((e) => e.type === 'released')
  assert.deepEqual([released.combo, released.reason], [id, 'shutting_down'])
  assert.equal(types().filter((t) => t === 'failed').length, 0)
})

test('a start that fails once and then works: the job renders', async () => {
  addCombo()
  const chrome = fakeChrome({ release: RELEASE, fail: (n) => (n === 1 ? new Error('Chrome did not open its DevTools port in 15 s.') : null) })
  const { renderer, worker } = setup(chrome)
  const stats = await worker.run({ once: true })
  await renderer.close()
  assert.equal(stats.stored, 1)
  assert.equal(chrome.attempts, 2)
})

test('the browser closes after the idle time and opens again for the next job', async () => {
  const chrome = fakeChrome({ release: RELEASE })
  const { renderer, worker, lines } = setup(chrome, { idleMs: 400 }, { pollIntervalMs: 20 })
  addCombo()
  const running = worker.run()
  try {
    while (fake.stored.size < 1) await sleep(5)
    assert.equal(chrome.open.length, 1, 'open while there is work')
    await sleep(150)
    assert.equal(chrome.open.length, 1, 'still open inside the idle time')
    await sleep(500)
    assert.equal(chrome.open.length, 0, 'closed after the idle time')
    assert.equal(chrome.browsers[0].closedBy, 'close')
    assert.ok(lines.some((l) => /^info browser closed: idle/.test(l)))
    addCombo()
    while (fake.stored.size < 2) await sleep(5)
    assert.equal(chrome.browsers.length, 2, 'a new browser for the next job')
    assert.equal(chrome.open.length, 1)
    await sleep(650)
    assert.equal(chrome.open.length, 0)
  } finally {
    worker.stop()
    await running
    await renderer.close()
  }
})

test('the idle time counts from the last shot: a queue keeps one browser', async () => {
  const chrome = fakeChrome({ release: RELEASE })
  const { renderer, worker } = setup(chrome, { idleMs: 400 })
  for (let i = 0; i < 4; i++) addCombo()
  const stats = await worker.run({ once: true })
  assert.equal(stats.stored, 4)
  assert.equal(chrome.browsers.length, 1)
  await sleep(600)
  assert.equal(chrome.open.length, 0)
  await renderer.close()
})

test('start() checks the browser at once, then closes it when idle', async () => {
  const chrome = fakeChrome({ release: RELEASE })
  const { renderer, lines } = setup(chrome, { idleMs: 50 })
  const { gpu } = await renderer.start()
  assert.equal(gpu, 'Fake GPU')
  assert.ok(lines.some((l) => /^info browser ready/.test(l)))
  assert.equal(chrome.open.length, 1)
  await sleep(100)
  assert.equal(chrome.open.length, 0)
  await renderer.close()
})

test('stopped while the page loads: the job is released, nothing left unhandled', async () => {
  const id = addCombo()
  let worker
  const chrome = fakeChrome({ release: RELEASE })
  const slow = { ...chrome, launch: async (o) => {
    const c = await chrome.launch(o)
    const send = c.cdp.send.bind(c.cdp)
    // The stop comes while Page.navigate is still being sent.
    c.cdp.send = async (method, ...rest) => { if (method === 'Page.navigate') { worker.stop(); await sleep(20) } return send(method, ...rest) }
    return c
  } }
  const unhandled = []
  const onUnhandled = (e) => unhandled.push(e)
  process.on('unhandledRejection', onUnhandled)
  try {
    const s = setup(slow)
    worker = s.worker
    const stats = await worker.run()
    await sleep(50)
    await s.renderer.close()
    assert.equal(stats.released, 1)
    assert.deepEqual(fake.events.filter((e) => e.type === 'released').map((e) => [e.combo, e.reason]), [[id, 'shutting_down']])
    assert.deepEqual(unhandled, [])
  } finally { process.off('unhandledRejection', onUnhandled) }
})

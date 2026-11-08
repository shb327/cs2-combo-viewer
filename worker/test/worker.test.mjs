// The loop against the fake API, with a renderer that returns prepared frames (no browser).
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createApi } from '../src/api.mjs'
import { texts } from '../src/png.mjs'
import { createWorker, FatalError, RenderError } from '../src/worker.mjs'
import { startFakeApi } from './fake-api.mjs'
import { drawnFrame, encodePng, memoryLog } from './helpers.mjs'

const RELEASE = '3de0d6e58111'
const config = { renderTimeoutMs: 60_000, pollIntervalMs: 5_000, renderRevision: 1 }
let fake, token

const addCombo = (over = {}) => fake.addCombo({
  glove: { def_index: 5034, paint_index: 10033, float: 0.15, seed: 269 },
  knife: { def_index: 507, paint_index: 415, float: 0.01, seed: 1 },
  agent: { def_index: 5404 },
  ...over,
})

/** A renderer that calls `behave(combo, opts, n)` for each render, by default a drawn frame. */
function fakeRenderer(behave = async () => ({ png: drawnFrame(), release: RELEASE })) {
  const calls = []
  return { calls, render: async (combo, opts) => { calls.push({ combo, opts }); return behave(combo, opts, calls.length) } }
}

function setup(renderer, tok = token) {
  const { log, lines } = memoryLog()
  const api = createApi({ apiUrl: fake.url, token: () => tok })
  return { worker: createWorker({ api, renderer, log, config }), lines }
}

const types = () => fake.events.map((e) => e.type)

before(async () => { fake = await startFakeApi(); token = fake.addWorker('pc') })
beforeEach(() => fake.clear())
after(() => fake.close())

test('once: draws every due combo, stores each PNG with its text chunks, stops at 204', async () => {
  const a = addCombo()
  const b = addCombo({ glove: { def_index: 5034, paint_index: 10064, float: 0.06, seed: null }, knife: { def_index: 515, paint_index: 0, float: null, seed: null } })
  const renderer = fakeRenderer()
  const { worker, lines } = setup(renderer)
  const stats = await worker.run({ once: true })
  assert.deepEqual(stats, { stored: 2, failed: 0, dropped: 0, released: 0 })
  assert.deepEqual(types(), ['claimed', 'stored', 'claimed', 'stored'])
  assert.deepEqual(texts(fake.stored.get(a)), { 'cs3d-release': RELEASE, 'cs3d-render-revision': '1', 'combo-id': a })
  assert.equal(texts(fake.stored.get(b))['combo-id'], b)
  // The null seeds and the vanilla knife's float are left to the viewer.
  assert.deepEqual(renderer.calls[1].combo, { knife: 515, knife_paint: 0, gloves: 5034, gloves_paint: 10064, gloves_float: 0.06, agent: 5404 })
  assert.ok(lines.every((l) => !l.includes(token)))
})

test('a blank or transparent frame is never sent: render_failed', async () => {
  const id = addCombo()
  const blank = encodePng(1920, 1080, () => [0, 0, 0, 0])
  const { worker } = setup(fakeRenderer(async () => ({ png: blank, release: RELEASE })))
  const stats = await worker.run({ once: true })
  assert.equal(fake.stored.size, 0)
  assert.equal(stats.failed, 1)
  const failed = fake.events.find((e) => e.type === 'failed')
  assert.equal(failed.combo, id)
  assert.equal(failed.reason, 'render_failed')
  assert.match(failed.detail, /blank \(fully transparent\)/)
})

test('a frame of the wrong size is reported, not sent', async () => {
  addCombo()
  const { worker } = setup(fakeRenderer(async () => ({ png: encodePng(1280, 720, (x) => [x % 256, 0, 0, 255]), release: RELEASE })))
  await worker.run({ once: true })
  assert.equal(fake.stored.size, 0)
  assert.match(fake.events.find((e) => e.type === 'failed').detail, /1280x720/)
})

test('a render error is reported with its reason', async () => {
  addCombo()
  const { worker } = setup(fakeRenderer(async () => { throw new RenderError('asset_missing', 'unknown-knife: Unknown knife (item 9999).') }))
  await worker.run({ once: true })
  const failed = fake.events.find((e) => e.type === 'failed')
  assert.equal(failed.reason, 'asset_missing')
  assert.equal(failed.detail, 'unknown-knife: Unknown knife (item 9999).')
})

test('inputs_changed, job_not_found and claim_expired: logged, no failure report, on to the next combo', async () => {
  const changed = addCombo(), reclaimed = addCombo(), expired = addCombo(), good = addCombo()
  const { worker, lines } = setup(fakeRenderer(async (combo, opts, n) => {
    if (n === 1) fake.changeInputs(changed)
    if (n === 2) fake.reclaim(reclaimed)
    if (n === 3) fake.expire(expired)
    if (n === 1) fake.combo(changed).due = false // the edit's new screenshot is a later claim's job
    return { png: drawnFrame(), release: RELEASE }
  }))
  const stats = await worker.run({ once: true })
  assert.equal(types().filter((t) => t === 'failed').length, 0)
  assert.deepEqual([...fake.stored.keys()], [good])
  assert.equal(stats.dropped, 3)
  assert.ok(lines.some((l) => /job gone/.test(l) && /inputs_changed/.test(l)))
  assert.ok(lines.some((l) => /job gone/.test(l) && /404/.test(l)))
  assert.ok(lines.some((l) => /claim expired/.test(l)))
})

test('the PNG refused by the API (413, 415, 422): render_failed with the code, logged loudly', async () => {
  addCombo()
  // The API refuses the upload's type (as it would a body the worker got wrong): a fetch that labels the PNG as JPEG.
  const realFetch = globalThis.fetch
  const api = createApi({ apiUrl: fake.url, token: () => token, fetch: (url, init) => realFetch(url, init.method === 'PUT' ? { ...init, headers: { ...init.headers, 'Content-Type': 'image/jpeg' } } : init) })
  const { log, lines } = memoryLog()
  await createWorker({ api, renderer: fakeRenderer(), log, config }).run({ once: true })
  const failed = fake.events.find((e) => e.type === 'failed')
  assert.equal(failed.reason, 'render_failed')
  assert.equal(failed.detail, 'upload refused: 415 unsupported_media_type')
  assert.ok(lines.some((l) => l.startsWith('error THE API REFUSED THE PNG')))
  assert.equal(fake.stored.size, 0)
})

test('stop during a render: the claim is released (shutting_down), not counted', async () => {
  const id = addCombo()
  let worker
  ;({ worker } = setup(fakeRenderer((combo, { signal }) => new Promise((resolve, reject) => {
    setTimeout(() => worker.stop(), 20)
    signal.addEventListener('abort', () => reject(new RenderError('render_failed', 'stopping')))
  }))))
  const stats = await worker.run()
  assert.equal(stats.released, 1)
  const released = fake.events.find((e) => e.type === 'released')
  assert.deepEqual([released.combo, released.reason], [id, 'shutting_down'])
  assert.equal(fake.combo(id).attempts, 0)
})

test('no GPU: the claim is released as gpu_unavailable and the worker stops', async () => {
  addCombo()
  const { worker } = setup(fakeRenderer(async () => { throw new RenderError('render_failed', 'no WebGL2', { fatal: true, release: 'gpu_unavailable' }) }))
  await assert.rejects(worker.run(), (e) => e instanceof FatalError && e.exitCode === 4)
  assert.equal(fake.events.find((e) => e.type === 'released').reason, 'gpu_unavailable')
})

test('a refused token stops the worker (exit 2) without printing it', async () => {
  const revoked = fake.addWorker('old')
  fake.revoke(revoked)
  const { worker, lines } = setup(fakeRenderer(), revoked)
  await assert.rejects(worker.run({ once: true }), (e) => e instanceof FatalError && e.exitCode === 2 && !e.message.includes(revoked))
  assert.ok(lines.every((l) => !l.includes(revoked)))
})

test('poll: waits after a 204 and takes a combo that becomes due', async () => {
  const renderer = fakeRenderer()
  const { log } = memoryLog()
  const api = createApi({ apiUrl: fake.url, token: () => token })
  const worker = createWorker({ api, renderer, log, config: { ...config, pollIntervalMs: 50 } })
  const running = worker.run()
  await new Promise((r) => setTimeout(r, 120))
  const id = addCombo()
  while (!fake.stored.has(id)) await new Promise((r) => setTimeout(r, 20))
  worker.stop()
  const stats = await running
  assert.equal(stats.stored, 1)
})

test('once, with the API down: gives up after a few tries (exit 2)', async () => {
  const { log } = memoryLog()
  const api = createApi({ apiUrl: 'http://127.0.0.1:9', token: () => token })
  const worker = createWorker({ api, renderer: fakeRenderer(), log, config })
  const started = Date.now()
  await assert.rejects(worker.run({ once: true }), (e) => e instanceof FatalError && e.exitCode === 2 && /doesn't answer/.test(e.message))
  assert.ok(Date.now() - started < 15_000)
})

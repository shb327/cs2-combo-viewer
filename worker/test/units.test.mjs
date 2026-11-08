import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readConfig } from '../src/config.mjs'
import { comboFor, jobProblem } from '../src/job.mjs'
import { createLog, redact } from '../src/log.mjs'
import { blankReason, decode, header, texts, withText } from '../src/png.mjs'
import { comboJob } from './fake-api.mjs'
import { drawnFrame, encodePng } from './helpers.mjs'

const TOKEN = 'csw_' + 'A'.repeat(43)

test('png: text chunks are added without changing the pixels, and read back', () => {
  const png = drawnFrame()
  const tagged = withText(png, { 'cs3d-release': '3de0d6e58111', 'cs3d-render-revision': '1', 'combo-id': 'k3v9x0m2q7ab' })
  assert.deepEqual(texts(tagged), { 'cs3d-release': '3de0d6e58111', 'cs3d-render-revision': '1', 'combo-id': 'k3v9x0m2q7ab' })
  assert.deepEqual(header(tagged), header(png))
  assert.ok(decode(tagged).rgba.equals(decode(png).rgba))
  assert.throws(() => withText(png, { 'bad\0key': 'x' }))
})

test('png: RGB and RGBA decode to the same pixels', () => {
  const px = (x, y) => [x * 10, y * 20, 7, 255]
  const a = decode(encodePng(5, 4, px, { colorType: 6 }))
  const b = decode(encodePng(5, 4, px, { colorType: 2 }))
  assert.ok(a.rgba.equals(b.rgba))
  assert.deepEqual([...a.rgba.subarray(4, 8)], [10, 0, 7, 255])
})

test('png: a blank or fully transparent frame is refused, a drawn one passes', () => {
  assert.equal(blankReason(decode(encodePng(64, 36, () => [0, 0, 0, 0]))), 'fully transparent')
  assert.equal(blankReason(decode(encodePng(64, 36, () => [11, 11, 18, 255]))), 'one flat colour')
  assert.match(blankReason(decode(encodePng(64, 36, (x) => (x < 32 ? [9, 9, 9, 0] : [x, 3, 3, 255])))), /transparent in 50%/)
  assert.equal(blankReason(decode(drawnFrame())), null)
})

test('config: needs the address and a well-formed token, and never shows the token', () => {
  assert.throws(() => readConfig({}), /COMBO_WORKER_TOKEN is missing/)
  assert.throws(() => readConfig({ COMBO_WORKER_TOKEN: 'abc', COMBO_API_URL: 'https://api.combo.skin' }), /does not look like/)
  assert.throws(() => readConfig({ COMBO_WORKER_TOKEN: TOKEN }), /COMBO_API_URL is missing/)
  assert.throws(() => readConfig({ COMBO_WORKER_TOKEN: TOKEN, COMBO_API_URL: 'http://api.combo.skin' }), /must use https/)
  assert.throws(() => readConfig({ COMBO_WORKER_TOKEN: TOKEN, COMBO_API_URL: 'https://u:p@api.combo.skin' }), /without credentials/)
  assert.throws(() => readConfig({ COMBO_WORKER_TOKEN: TOKEN, COMBO_API_URL: 'http://127.0.0.1:8000', WORKER_RENDER_TIMEOUT: '300' }), /10 to 270/)
  for (const bad of ['', 'abc']) {
    try { readConfig({ COMBO_WORKER_TOKEN: TOKEN + bad.repeat(2) + 'x', COMBO_API_URL: 'x' }) } catch (e) { assert.ok(!e.message.includes(TOKEN)) }
  }
  const c = readConfig({ COMBO_WORKER_TOKEN: ` ${TOKEN} `, COMBO_API_URL: 'http://127.0.0.1:8000/', WORKER_RENDER_TIMEOUT: '90' })
  assert.equal(c.apiUrl, 'http://127.0.0.1:8000')
  assert.equal(c.renderTimeoutMs, 90_000)
  assert.equal(c.pollIntervalMs, 60_000)
  assert.equal(c.token(), TOKEN)
  assert.ok(!JSON.stringify(c).includes('csw_'))
  assert.ok(!Object.keys(c).includes('token'))
})

test('log: tokens are redacted from every line', () => {
  const lines = []
  const log = createLog({ write: (l) => lines.push(l), now: () => new Date(0) })
  log.error(`oops ${TOKEN}`, { header: `Bearer ${TOKEN}` })
  assert.equal(lines.length, 1)
  assert.ok(!lines[0].includes(TOKEN))
  assert.equal(redact(`Authorization: Bearer abc.def`), 'Authorization: Bearer …')
})

test('job: null seeds and a vanilla knife\'s float are left out for the viewer\'s defaults', () => {
  const job = { job_id: 'w8d2k0q5n1zc', lease_expires_at: new Date().toISOString(), ...comboJob({
    glove: { def_index: 5034, paint_index: 10064, float: 0.06, seed: null },
    knife: { def_index: 515, paint_index: 0, float: null, seed: null },
    agent: { def_index: 5404 },
  }) }
  assert.equal(jobProblem(job), null)
  assert.deepEqual(comboFor(job), { knife: 515, knife_paint: 0, gloves: 5034, gloves_paint: 10064, gloves_float: 0.06, agent: 5404 })
  const seeded = { ...job, knife: { ...job.knife, paint_index: 419, float: 0, seed: 387 }, glove: { ...job.glove, seed: 12 } }
  assert.deepEqual(comboFor(seeded), { knife: 515, knife_paint: 419, knife_float: 0, knife_seed: 387, gloves: 5034, gloves_paint: 10064, gloves_float: 0.06, gloves_seed: 12, agent: 5404 })
  assert.match(jobProblem({ ...job, image: { width: 1280, height: 720, type: 'image/png' } }), /1280x720/)
  assert.match(jobProblem({ ...job, glove: { ...job.glove, seed: 5000 } }), /bad seed/)
})

// The API client against the fake API: the contract's answers, and what the worker sends.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { ApiError, createApi } from '../src/api.mjs'
import { withText } from '../src/png.mjs'
import { startFakeApi } from './fake-api.mjs'
import { drawnFrame, encodePng } from './helpers.mjs'

let fake, token, api
const combo = () => fake.addCombo({
  glove: { def_index: 5034, paint_index: 10033, float: 0.15, seed: 269 },
  knife: { def_index: 507, paint_index: 415, float: 0.01, seed: 1 },
  agent: { def_index: 5404 },
})
const refused = async (promise, status, code) => {
  await assert.rejects(promise, (e) => e instanceof ApiError && e.status === status && (code === undefined || e.code === code))
}

before(async () => {
  fake = await startFakeApi()
  token = fake.addWorker('pc')
  api = createApi({ apiUrl: fake.url, token: () => token })
})
beforeEach(() => fake.clear())
after(() => fake.close())

test('a bad token gets 401; a page with an Origin header 403', async () => {
  await refused(createApi({ apiUrl: fake.url, token: () => 'csw_' + 'B'.repeat(43) }).me(), 401, 'not_authenticated')
  const res = await fetch(fake.url + '/worker/me', { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })
  assert.equal(res.status, 403)
  assert.deepEqual(await api.me(), { name: 'pc' })
})

test('the worker sends no Origin header, its token as a Bearer, and nothing else that identifies it', async () => {
  await api.me()
  const last = fake.requests[fake.requests.length - 1]
  assert.equal(last.headers.origin, undefined)
  assert.equal(last.headers.authorization, `Bearer ${token}`)
  assert.equal(last.headers.cookie, undefined)
})

test('claim: a job, then 204 when nothing is due', async () => {
  const id = combo()
  const job = await api.claim()
  assert.equal(job.combo_id, id)
  assert.match(job.job_id, /^[a-z0-9]{12}$/)
  assert.ok(Date.parse(job.lease_expires_at) > Date.now() + 4 * 60_000)
  assert.equal(await api.claim(), null)
  await api.release(job.job_id, 'shutting_down')
  const again = await api.claim()
  assert.equal(again.combo_id, id)
  await api.release(again.job_id, 'shutting_down')
})

test('upload: a PNG with the worker\'s text chunks is stored; the format checks refuse the rest', async () => {
  const id = combo()
  const job = (await api.claim())
  const tagged = withText(drawnFrame(), { 'cs3d-release': '3de0d6e58111', 'cs3d-render-revision': '1', 'combo-id': id })
  await refused(api.upload(job.job_id, encodePng(1280, 720, () => [1, 2, 3, 255])), 422, 'wrong_size')
  await refused(api.upload(job.job_id, encodePng(1920, 1080, () => [1, 2, 3, 255], { bitDepth: 16 })), 422, 'bad_pixel_format')
  await refused(api.upload(job.job_id, Buffer.from('not a png')), 422, 'not_png')
  await refused(api.upload(job.job_id, tagged.subarray(0, tagged.length - 2000)), 422, 'not_png')
  const res = await fetch(`${fake.url}/worker/jobs/${job.job_id}/screenshot`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: tagged })
  assert.equal(res.status, 415)
  const big = Buffer.concat([tagged, Buffer.alloc(16 * 1024 * 1024)])
  await refused(api.upload(job.job_id, big), 413, 'too_large')
  const stored = await api.upload(job.job_id, tagged)
  assert.equal(stored.combo_id, id)
  assert.ok(fake.stored.get(id).equals(tagged))
  await refused(api.upload(job.job_id, tagged), 409, 'claim_expired')
})

test('lost claims: claim_expired after the lease, inputs_changed after an edit, job_not_found once claimed again', async () => {
  const frame = drawnFrame()
  const a = combo(); const ja = await api.claim(); fake.expire(a)
  await refused(api.upload(ja.job_id, frame), 409, 'claim_expired')
  await refused(api.fail(ja.job_id, 'render_failed', 'x'), 409, 'claim_expired')
  await refused(api.release(ja.job_id, 'shutting_down'), 409, 'claim_expired')
  assert.equal(await api.claim(), null) // the expired lease counted: the combo waits a minute
  assert.equal(fake.combo(a).attempts, 1)
  fake.combo(a).due = false

  const b = combo(); const jb = await api.claim(); fake.changeInputs(b)
  await refused(api.upload(jb.job_id, frame), 409, 'inputs_changed')
  fake.combo(b).due = false

  const c = combo(); const jc = await api.claim(); fake.reclaim(c)
  await refused(api.upload(jc.job_id, frame), 404, 'job_not_found')
  await refused(api.fail('nosuchjob123', 'timeout', ''), 404, 'job_not_found')
  fake.combo(c).due = false
})

test('fail and release: 204, with the reasons checked', async () => {
  const id = combo()
  const job = await api.claim()
  await refused(api.fail(job.job_id, 'bored', ''), 422)
  await api.fail(job.job_id, 'asset_missing', 'unknown-knife: Unknown knife (item 9999).')
  assert.equal(fake.events.at(-1).type, 'failed')
  assert.equal(fake.combo(id).attempts, 1)
  assert.equal(await api.claim(), null) // waits a minute after a failure
})

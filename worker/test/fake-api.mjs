// A stand-in for Combo Skin's worker routes, following its api/README.md ("Screenshots") and spec 015: tokens, the
// claim and its 5-minute lease, 204 with nothing due, uploads with the PNG checks, failures, releases, and the
// refusals (401, 403 with an Origin header, 404 job_not_found, 409 claim_expired / inputs_changed, 413, 415, 422).
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { inflateSync } from 'node:zlib'
import { chunks, header } from '../src/png.mjs'

export const LEASE_MS = 5 * 60_000
const MAX_BYTES = 16 * 1024 * 1024
const id12 = () => randomBytes(9).toString('base64url').slice(0, 12).replace(/[-_]/g, 'x').toLowerCase()
export const makeToken = () => 'csw_' + randomBytes(32).toString('base64url')

/** A job's combo part, as the API sends it (the job adds job_id and lease_expires_at). */
export function comboJob({ combo_id = id12(), glove, knife, agent, render_revision = 1 }) {
  const item = (x) => ({ codename: 'x', paint_codename: 'x', name: 'x', float_from: null, float_to: null, seeds: [], seed: null, ...x })
  return {
    combo_id, image: { width: 1920, height: 1080, type: 'image/png' },
    glove: item(glove), knife: item(knife),
    agent: { codename: 'x', name: 'x', team: 'ct', default: true, ...agent },
    render_revision,
  }
}

/** The checks the API makes on an upload before storing it (signature and header first, then the pixels). */
function checkPng(body, image) {
  let h
  try { h = header(body) } catch { return 'not_png' }
  if (h.width !== image.width || h.height !== image.height) return 'wrong_size'
  if (h.bitDepth !== 8 || (h.colorType !== 2 && h.colorType !== 6)) return 'bad_pixel_format'
  try {
    const raw = inflateSync(Buffer.concat(chunks(body).filter((c) => c.type === 'IDAT').map((c) => c.data)))
    const channels = h.colorType === 6 ? 4 : 3
    if (raw.length !== (h.width * channels + 1) * h.height) return 'not_png'
  } catch { return 'not_png' }
  return null
}

/**
 * @param {{ now?: () => number }} [opts] a clock, for leases
 */
export async function startFakeApi({ now = Date.now } = {}) {
  const workers = new Map() // token -> { name, revoked }
  const combos = new Map() // combo_id -> { job (combo part), due, inputs, claim: {job_id, token, expires, open} | null, attempts }
  const events = [] // what happened, for the tests
  const stored = new Map() // combo_id -> PNG
  const requests = []

  const send = (res, status, body) => {
    res.setHeader('Cache-Control', 'no-store')
    if (body === undefined) { res.writeHead(status).end(); return }
    res.setHeader('Content-Type', 'application/json')
    res.writeHead(status).end(JSON.stringify(body))
  }
  const detail = (res, status, code) => send(res, status, { detail: code })

  /** An expired lease counts as a failed attempt and closes the claim (the next claim sees it). */
  function expireLeases() {
    for (const c of combos.values()) {
      if (c.claim?.open && now() >= c.claim.expires) {
        c.claim.open = false
        c.attempts++
        c.notBefore = c.claim.expires + (c.attempts === 1 ? 60_000 : 600_000)
        events.push({ type: 'lease_expired', combo: c.job.combo_id, job: c.claim.job_id })
      }
    }
  }

  /** The claim for a job id: [combo, claim] or an error code. */
  function findClaim(jobId, token) {
    for (const c of combos.values()) {
      if (c.claim?.job_id !== jobId) continue
      if (c.claim.token !== token) return { error: [404, 'job_not_found'] }
      if (!c.claim.open || now() >= c.claim.expires) return { error: [409, 'claim_expired'] }
      return { combo: c }
    }
    return { error: [404, 'job_not_found'] }
  }

  async function readBody(req, limit) {
    const parts = []
    let size = 0
    for await (const part of req) {
      size += part.length
      if (size > limit) return null
      parts.push(part)
    }
    return Buffer.concat(parts)
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    requests.push({ method: req.method, path: url.pathname, headers: { ...req.headers } })
    if (!url.pathname.startsWith('/worker/')) return detail(res, 404, 'not_found')
    if (req.headers.origin !== undefined) return detail(res, 403, 'origin_not_allowed')
    const auth = /^Bearer (csw_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')
    const worker = auth && workers.get(auth[1])
    if (!worker || worker.revoked) return detail(res, 401, 'not_authenticated')
    const token = auth[1]
    expireLeases()

    if (req.method === 'GET' && url.pathname === '/worker/me') return send(res, 200, { name: worker.name })

    if (req.method === 'POST' && url.pathname === '/worker/jobs/claim') {
      const due = [...combos.values()].find((c) => c.due && !(c.claim?.open) && c.attempts < 3 && (c.notBefore ?? 0) <= now())
      if (!due) return send(res, 204)
      const job_id = id12()
      const expires = now() + LEASE_MS
      due.claim = { job_id, token, expires, open: true, inputs: due.inputs }
      events.push({ type: 'claimed', combo: due.job.combo_id, job: job_id })
      return send(res, 200, { job_id, lease_expires_at: new Date(expires).toISOString(), ...due.job })
    }

    const m = /^\/worker\/jobs\/([^/]+)\/(screenshot|fail|release)$/.exec(url.pathname)
    if (!m) return detail(res, 404, 'not_found')
    const [, jobId, action] = m

    if (action === 'screenshot' && req.method === 'PUT') {
      const found = findClaim(jobId, token)
      if (found.error) return detail(res, ...found.error)
      const c = found.combo
      if (c.inputs !== c.claim.inputs) {
        c.claim.open = false
        events.push({ type: 'inputs_changed', combo: c.job.combo_id, job: jobId })
        return detail(res, 409, 'inputs_changed')
      }
      if ((req.headers['content-type'] ?? '').split(';')[0].trim() !== 'image/png') return detail(res, 415, 'unsupported_media_type')
      if (Number(req.headers['content-length'] ?? 0) > MAX_BYTES) return detail(res, 413, 'too_large')
      const body = await readBody(req, MAX_BYTES)
      if (!body) return detail(res, 413, 'too_large')
      const problem = checkPng(body, c.job.image)
      if (problem) return detail(res, 422, problem)
      c.claim.open = false
      c.due = false
      c.attempts = 0
      stored.set(c.job.combo_id, body)
      events.push({ type: 'stored', combo: c.job.combo_id, job: jobId, bytes: body.length })
      return send(res, 201, { combo_id: c.job.combo_id, screenshot: { width: 1920, height: 1080, images: [] } })
    }

    if ((action === 'fail' || action === 'release') && req.method === 'POST') {
      const body = await readBody(req, 64 * 1024)
      let data
      try { data = JSON.parse(body?.toString('utf8') ?? '') } catch { return send(res, 422, { detail: [{ loc: ['body'], type: 'json_invalid' }] }) }
      const reasons = action === 'fail' ? ['render_failed', 'asset_missing', 'timeout'] : ['shutting_down', 'gpu_unavailable']
      if (!reasons.includes(data?.reason)) return send(res, 422, { detail: [{ loc: ['body', 'reason'], type: 'enum' }] })
      if (action === 'fail' && (typeof data.detail !== 'string' || data.detail.length > 300)) return send(res, 422, { detail: [{ loc: ['body', 'detail'], type: 'string_too_long' }] })
      const found = findClaim(jobId, token)
      if (found.error) return detail(res, ...found.error)
      const c = found.combo
      c.claim.open = false
      if (action === 'fail') { c.attempts++; c.notBefore = now() + (c.attempts === 1 ? 60_000 : 600_000) }
      events.push({ type: action === 'fail' ? 'failed' : 'released', combo: c.job.combo_id, job: jobId, reason: data.reason, detail: data.detail })
      return send(res, 204)
    }
    return detail(res, 405, 'method_not_allowed')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${server.address().port}`

  return {
    url, events, stored, requests,
    /** A worker and its token. */
    addWorker(name = 'test-worker') { const t = makeToken(); workers.set(t, { name, revoked: false }); return t },
    revoke(token) { const w = workers.get(token); if (w) w.revoked = true; for (const c of combos.values()) if (c.claim?.token === token) c.claim.open = false },
    /** A combo that needs a screenshot. */
    addCombo(job) { const j = comboJob(job); combos.set(j.combo_id, { job: j, due: true, inputs: 1, claim: null, attempts: 0 }); return j.combo_id },
    /** Changes the combo's render inputs (an admin edit): an upload for an older claim gets inputs_changed. */
    changeInputs(comboId) { const c = combos.get(comboId); c.inputs++; c.due = true },
    /** Ends the claim's lease now. */
    expire(comboId) { const c = combos.get(comboId); if (c.claim) c.claim.expires = now() - 1 },
    /** Gives the combo's claim to someone else (its old job id is then unknown). */
    reclaim(comboId) { const c = combos.get(comboId); if (c.claim) c.claim = { ...c.claim, job_id: id12(), token: 'other' } },
    combo: (id) => combos.get(id),
    /** Forgets every combo (between tests). */
    clear() { combos.clear(); stored.clear(); events.length = 0 },
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) }),
  }
}

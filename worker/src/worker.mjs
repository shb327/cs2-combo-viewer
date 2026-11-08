// The loop: claim a combo, draw it, send the PNG (or report why not), claim the next.
import { ApiError, NetworkError } from './api.mjs'
import { comboFor, jobProblem, SHOT } from './job.mjs'
import { blankReason, decode, header, PngError, withText } from './png.mjs'

/** A render that failed: the API's reason, a short detail, and whether the browser is still fit for the next job. */
export class RenderError extends Error {
  constructor(reason, detail, { fatal = false, release = null } = {}) {
    super(detail)
    this.reason = reason
    this.fatal = fatal
    /** Release the claim with this reason instead of reporting a failure (no GPU: not the combo's fault). */
    this.release = release
  }
}

/** The worker can't go on (a refused token, no GPU): it stops with this exit code. */
export class FatalError extends Error {
  constructor(message, exitCode) { super(message); this.exitCode = exitCode }
}

/** Raised inside a job when the worker is told to stop. */
class Stopping extends Error {}

const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve()
  const t = setTimeout(done, ms)
  function done() { clearTimeout(t); signal?.removeEventListener('abort', done); resolve() }
  signal?.addEventListener('abort', done, { once: true })
})

/** Time left before an upload gives up: the lease, less a margin. */
const LEASE_MARGIN_MS = 10_000
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

/**
 * @param {object} deps
 * @param {ReturnType<import('./api.mjs').createApi>} deps.api
 * @param {{ render(combo: object, opts: { id: string, timeoutMs: number, signal: AbortSignal }): Promise<{ png: Buffer, release: string }> }} deps.renderer
 * @param {ReturnType<import('./log.mjs').createLog>} deps.log
 * @param {{ renderTimeoutMs: number, pollIntervalMs: number, renderRevision?: number }} deps.config
 * @param {() => number} [deps.now]
 */
export function createWorker({ api, renderer, log, config, now = Date.now }) {
  const stop = new AbortController()
  const stats = { stored: 0, failed: 0, dropped: 0, released: 0 }
  /** The job in hand, released on shutdown. */
  let current = null

  /** An API call retried on network errors and 5xx while `until` allows (and the worker isn't stopping). */
  async function retrying(what, fn, until = () => true) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn()
      } catch (e) {
        const transient = e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)
        if (!transient || stop.signal.aborted || !until()) throw e
        const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
        log.warn(`${what} failed, trying again`, { error: e.message, in_s: wait / 1000 })
        await sleep(wait, stop.signal)
      }
    }
  }

  function fatalIfAuth(e) {
    if (e instanceof ApiError && e.status === 401) throw new FatalError('The API refused the token (401 not_authenticated): it was revoked or mistyped. Make a new one on the dashboard\'s Screenshots page.', 2)
    if (e instanceof ApiError && e.status === 403) throw new FatalError(`The API refused the worker's requests (403 ${e.code ?? ''}).`, 2)
  }

  /** Reports a failure; answers that say the job is gone are logged, not errors. */
  async function reportFailure(job, reason, detail) {
    try {
      await retrying('fail report', () => api.fail(job.job_id, reason, detail))
      stats.failed++
      log.warn('reported failure', { job: job.job_id, combo: job.combo_id, reason, detail })
    } catch (e) {
      fatalIfAuth(e)
      if (e instanceof ApiError && (e.status === 404 || e.status === 409)) log.info('job gone before its failure report', { job: job.job_id, status: e.status, code: e.code })
      else log.error('failure report not sent', { job: job.job_id, error: e.message })
    }
  }

  async function releaseJob(job, reason) {
    try {
      await api.release(job.job_id, reason)
      stats.released++
      log.info('released claim', { job: job.job_id, combo: job.combo_id, reason })
    } catch (e) {
      log.warn('release not sent (the lease will expire)', { job: job.job_id, error: e.message })
    }
  }

  /** The PNG to send: the viewer's frame with its text chunks, checked as the API will check it, and not blank. */
  function finish(job, png, release) {
    const tagged = withText(png, { 'cs3d-release': release, 'cs3d-render-revision': String(job.render_revision ?? ''), 'combo-id': job.combo_id })
    const h = header(tagged)
    if (h.width !== SHOT.width || h.height !== SHOT.height) throw new RenderError('render_failed', `the frame is ${h.width}x${h.height}, not ${SHOT.width}x${SHOT.height}`)
    if (h.bitDepth !== 8 || (h.colorType !== 2 && h.colorType !== 6)) throw new RenderError('render_failed', `the frame is not 8-bit RGB or RGBA (colour type ${h.colorType})`)
    const blank = blankReason(decode(tagged))
    if (blank) throw new RenderError('render_failed', `the frame is blank (${blank})`)
    return tagged
  }

  async function upload(job, png, started) {
    const lease = Date.parse(job.lease_expires_at)
    const until = () => !Number.isFinite(lease) || now() < lease - LEASE_MARGIN_MS
    try {
      await retrying('upload', () => api.upload(job.job_id, png), until)
      stats.stored++
      log.info('stored', { job: job.job_id, combo: job.combo_id, bytes: png.length, ms: now() - started })
    } catch (e) {
      fatalIfAuth(e)
      if (!(e instanceof ApiError)) { log.error('upload not sent; the lease will expire', { job: job.job_id, error: e.message }); return }
      if (e.status === 404 || (e.status === 409 && e.code === 'inputs_changed')) {
        stats.dropped++
        log.info('job gone, not stored (the combo changed or was claimed again)', { job: job.job_id, combo: job.combo_id, status: e.status, code: e.code })
      } else if (e.status === 409) {
        stats.dropped++
        log.info('claim expired, not stored (the lease already counted)', { job: job.job_id, combo: job.combo_id, code: e.code })
      } else if ([413, 415, 422].includes(e.status)) {
        log.error('THE API REFUSED THE PNG: a bug in the worker', { job: job.job_id, combo: job.combo_id, status: e.status, code: e.code })
        await reportFailure(job, 'render_failed', `upload refused: ${e.status} ${e.code ?? ''}`.trim())
      } else {
        log.error('upload refused', { job: job.job_id, status: e.status, code: e.code })
      }
    }
  }

  async function process(job) {
    const started = now()
    const problem = jobProblem(job)
    if (problem) {
      log.error('job refused', { job: job?.job_id, problem })
      if (typeof job?.job_id === 'string') await reportFailure(job, 'render_failed', `the worker can't draw this job: ${problem}`)
      return
    }
    if (config.renderRevision !== undefined && job.render_revision !== config.renderRevision) {
      log.warn('render revision differs from this worker\'s', { job: job.job_id, job_revision: job.render_revision, worker_revision: config.renderRevision })
    }
    const combo = comboFor(job)
    log.info('claimed', { job: job.job_id, combo: job.combo_id, knife: job.knife.name, gloves: job.glove.name, agent: job.agent.name })
    const lease = Date.parse(job.lease_expires_at)
    const leaseLeft = Number.isFinite(lease) ? lease - now() - LEASE_MARGIN_MS * 3 : config.renderTimeoutMs
    const timeoutMs = Math.max(5_000, Math.min(config.renderTimeoutMs, leaseLeft))
    let shot
    try {
      shot = await renderer.render(combo, { id: job.job_id, timeoutMs, signal: stop.signal })
      if (stop.signal.aborted) throw new Stopping()
      const png = finish(job, shot.png, shot.release)
      log.info('rendered', { job: job.job_id, release: shot.release, ms: now() - started })
      await upload(job, png, started)
    } catch (e) {
      if (e instanceof Stopping || stop.signal.aborted) { await releaseJob(job, 'shutting_down'); return }
      if (e instanceof FatalError) throw e
      if (e instanceof RenderError) {
        if (e.release) { await releaseJob(job, e.release) }
        else await reportFailure(job, e.reason, e.message)
        if (e.fatal) throw new FatalError(`Stopping: ${e.message}`, 4)
        return
      }
      if (e instanceof PngError) { await reportFailure(job, 'render_failed', `the frame is not a valid PNG: ${e.message}`); return }
      await reportFailure(job, 'render_failed', `unexpected: ${e.message}`)
      throw e
    }
  }

  return {
    stats,
    /** Asks the loop to stop: no new claims, the render in progress is cancelled and its claim released. */
    stop: () => stop.abort(),
    get stopping() { return stop.signal.aborted },
    /**
     * Works through the queue. `once`: until the first 204, then returns; else polls every `pollIntervalMs`.
     */
    async run({ once = false } = {}) {
      let me
      // Polling, the worker waits for an API that is down (it may be starting); once, it gives up after a few tries.
      let tries = 0
      try {
        me = await retrying('GET /worker/me', () => { tries++; return api.me() }, () => !once || tries < 3)
      } catch (e) {
        fatalIfAuth(e)
        throw new FatalError(`The API at its address doesn't answer: ${e.message}`, 2)
      }
      log.info('worker', { name: me?.name, mode: once ? 'once' : 'poll' })
      while (!stop.signal.aborted) {
        let job
        try {
          job = await retrying('claim', () => api.claim())
        } catch (e) {
          fatalIfAuth(e)
          if (stop.signal.aborted) break
          log.error('claim failed', { error: e.message })
          await sleep(BACKOFF_MS[BACKOFF_MS.length - 1], stop.signal)
          continue
        }
        if (!job) {
          if (once) { log.info('nothing due: done', stats); break }
          await sleep(config.pollIntervalMs, stop.signal)
          continue
        }
        current = job
        try { await process(job) } finally { current = null }
      }
      return stats
    },
    get current() { return current },
  }
}

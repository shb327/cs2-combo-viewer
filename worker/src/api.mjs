// The Combo Skin API's worker routes (combo-skin api/README.md, "Screenshots"). Node's fetch sends no Origin header,
// which the API requires of worker requests.

const REQUEST_TIMEOUT_MS = 30_000

/** A refusal by the API: the status and its `detail` code. */
export class ApiError extends Error {
  constructor(status, code, route) {
    super(`${route}: ${status}${code ? ` ${code}` : ''}`)
    this.status = status
    this.code = code
  }
}

/** The request didn't get an answer (network, DNS, timeout): worth trying again. */
export class NetworkError extends Error {}

export const FAIL_REASONS = ['render_failed', 'asset_missing', 'timeout']
export const RELEASE_REASONS = ['shutting_down', 'gpu_unavailable']

/**
 * @param {{ apiUrl: string, token: () => string, userAgent?: string, fetch?: typeof fetch }} opts
 */
export function createApi({ apiUrl, token, userAgent = 'cs2-combo-worker', fetch: doFetch = fetch }) {
  async function request(method, route, { json, body, contentType, signal } = {}) {
    const headers = { Authorization: `Bearer ${token()}`, Accept: 'application/json', 'User-Agent': userAgent }
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
    else if (contentType) headers['Content-Type'] = contentType
    const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal].filter(Boolean)
    let res
    try {
      res = await doFetch(apiUrl + route, { method, headers, body, signal: AbortSignal.any(signals), redirect: 'error' })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new NetworkError(`${method} ${route}: ${e.cause?.code ?? e.name}`)
    }
    const text = await res.text()
    let data = null
    if (text) { try { data = JSON.parse(text) } catch { data = null } }
    if (!res.ok) throw new ApiError(res.status, typeof data?.detail === 'string' ? data.detail : null, `${method} ${route}`)
    return { status: res.status, data }
  }
  const job = (id) => `/worker/jobs/${encodeURIComponent(id)}`
  return {
    /** The token's worker: `{ name }`. */
    me: async () => (await request('GET', '/worker/me')).data,
    /** One due combo for 5 minutes, or null when nothing is due (204). */
    claim: async () => {
      const r = await request('POST', '/worker/jobs/claim')
      return r.status === 204 ? null : r.data
    },
    /** The screenshot for a live claim: 201 `{ combo_id, screenshot }`. */
    upload: async (jobId, png, signal) => (await request('PUT', job(jobId) + '/screenshot', { body: png, contentType: 'image/png', signal })).data,
    fail: async (jobId, reason, detail) => {
      await request('POST', job(jobId) + '/fail', { json: { reason, detail: String(detail ?? '').slice(0, 300) } })
    },
    release: async (jobId, reason) => {
      await request('POST', job(jobId) + '/release', { json: { reason } })
    },
  }
}

const CACHE_NAME = 'json-cache-v1'
const STORED_AT = 'x-stored-at'

/**
 * Fetches JSON through the browser's Cache Storage, kept for `maxAgeMs`: a stored copy younger than that is used
 * without asking the network (db.json is several MB and served without cache). Where Cache Storage isn't available
 * (insecure origins, some private windows) it is a plain fetch; a failed refresh falls back to the stale copy.
 */
export async function cachedJson<T>(url: string, maxAgeMs: number): Promise<T> {
  const cache = typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME).catch(() => null)
  const stored = await cache?.match(url).catch(() => undefined)
  const storedAt = Number(stored?.headers.get(STORED_AT) ?? 0)
  if (stored && Date.now() - storedAt < maxAgeMs) return stored.json() as Promise<T>
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(url + ': HTTP ' + response.status)
    const body = await response.text()
    if (cache) {
      const headers = new Headers({ 'content-type': 'application/json', [STORED_AT]: String(Date.now()) })
      await cache.put(url, new Response(body, { headers })).catch(() => {})
    }
    return JSON.parse(body) as T
  } catch (e) {
    if (stored) return stored.json() as Promise<T>
    throw e
  }
}

// The worker's settings, all from environment variables (worker/README.md, "Settings").
import os from 'node:os'
import path from 'node:path'

/** A worker token as the dashboard makes it: `csw_` and 43 base64url characters (256 bits). */
export const TOKEN_PATTERN = /^csw_[A-Za-z0-9_-]{43}$/
/** The API's claim lasts 5 minutes; a render must end well before it does. */
export const LEASE_MS = 5 * 60_000
const MAX_RENDER_TIMEOUT_S = 270

export class ConfigError extends Error {}

const DEFAULT_CHROME = {
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
}

/** A whole number of seconds from the environment, in a range. */
function seconds(env, name, fallback, min, max) {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  if (!/^\d+$/.test(raw.trim())) throw new ConfigError(`${name} must be a whole number of seconds.`)
  const n = Number(raw)
  if (n < min || n > max) throw new ConfigError(`${name} must be from ${min} to ${max} seconds.`)
  return n
}

/** The API's address: https, or plain http only on this machine. */
function apiUrl(raw) {
  if (!raw) throw new ConfigError('COMBO_API_URL is missing (the Combo Skin API\'s address, for example http://127.0.0.1:8000).')
  let url
  try { url = new URL(raw) } catch { throw new ConfigError('COMBO_API_URL is not a URL.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new ConfigError('COMBO_API_URL must use https (plain http only for localhost or 127.0.0.1): the token travels with every request.')
  }
  if (url.username || url.password || url.search || url.hash) throw new ConfigError('COMBO_API_URL must be an address only, without credentials, query or fragment.')
  return url.href.replace(/\/+$/, '')
}

/**
 * Reads the settings. The token is checked for its form and kept out of the returned object's enumerable fields, so
 * logging or printing the config can't show it; take it with `token()`.
 * @param {Record<string, string | undefined>} env
 */
export function readConfig(env = process.env) {
  const token = env.COMBO_WORKER_TOKEN?.trim()
  if (!token) throw new ConfigError('COMBO_WORKER_TOKEN is missing (the token made for this worker on the dashboard\'s Screenshots page).')
  if (!TOKEN_PATTERN.test(token)) throw new ConfigError('COMBO_WORKER_TOKEN does not look like a worker token (csw_ and 43 characters).')
  const config = {
    apiUrl: apiUrl(env.COMBO_API_URL?.trim()),
    renderTimeoutMs: seconds(env, 'WORKER_RENDER_TIMEOUT', 120, 10, MAX_RENDER_TIMEOUT_S) * 1000,
    pollIntervalMs: seconds(env, 'WORKER_POLL_INTERVAL', 60, 5, 3600) * 1000,
    chromePath: env.CHROME_PATH?.trim() || DEFAULT_CHROME[process.platform] || 'google-chrome',
    profileDir: path.resolve(env.WORKER_PROFILE_DIR?.trim() || path.join(os.homedir(), '.cache', 'cs2-combo-worker', 'chrome-profile')),
  }
  Object.defineProperty(config, 'token', { value: () => token, enumerable: false })
  return config
}

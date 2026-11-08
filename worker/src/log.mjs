// One line per event, with the time: `2026-11-08T12:00:00.000Z info  claimed job=… combo=…`.
// Every line passes through `redact`, so a token can't reach the output even by mistake.

const TOKEN = /csw_[A-Za-z0-9_-]{20,}/g
const BEARER = /(Bearer\s+)\S+/gi

export const redact = (text) => String(text).replace(TOKEN, 'csw_…').replace(BEARER, '$1…')

const field = ([k, v]) => {
  if (v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return ` ${k}=${/\s/.test(s) ? JSON.stringify(s) : s}`
}

/**
 * @param {{ write?: (line: string) => void, now?: () => Date }} [opts]
 */
export function createLog({ write = (line) => process.stdout.write(line + '\n'), now = () => new Date() } = {}) {
  const emit = (level, message, fields = {}) =>
    write(redact(`${now().toISOString()} ${level.padEnd(5)} ${message}${Object.entries(fields).map(field).join('')}`))
  return {
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  }
}

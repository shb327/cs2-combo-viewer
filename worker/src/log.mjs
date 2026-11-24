// One line per event, with the time: `2026-11-08T12:00:00.000Z info  claimed job=… combo=…`.
// Every line passes through `redact`, so a token can't reach the output even by mistake. To stdout, or to a file
// that is moved to `<file>.1` when it passes its size (WORKER_LOG_FILE; the macOS service uses it).
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

/** A log file's size before it is moved to `<file>.1` (one old file is kept: at most twice this on disk). */
export const LOG_MAX_BYTES = 5 * 1024 * 1024

const TOKEN = /csw_[A-Za-z0-9_-]{20,}/g
const BEARER = /(Bearer\s+)\S+/gi

export const redact = (text) => String(text).replace(TOKEN, 'csw_…').replace(BEARER, '$1…')

const field = ([k, v]) => {
  if (v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return ` ${k}=${/\s/.test(s) ? JSON.stringify(s) : s}`
}

/** Appends each line to `file`, first moving it to `<file>.1` (over the older one) when the line would pass `maxBytes`. */
export function fileWriter(file, { maxBytes = LOG_MAX_BYTES } = {}) {
  mkdirSync(path.dirname(file), { recursive: true })
  return (line) => {
    const data = line + '\n'
    let size = 0
    try { size = statSync(file).size } catch { /* not there yet */ }
    if (size > 0 && size + Buffer.byteLength(data) > maxBytes) {
      try { renameSync(file, file + '.1') } catch { /* another process moved it */ }
    }
    appendFileSync(file, data)
  }
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

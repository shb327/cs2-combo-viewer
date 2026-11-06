// Runs the C# tool (shader-dump) on the copied VPKs. It refuses any path outside the copies and the output folder.
//
// Extraction from pak01 is incremental: each job's result is kept in work/cache/extract.json under a key made of the
// job (kind, game path, output), the CRC32 that pak01's directory stores for the source file (and for the files it
// depends on), and a hash of the tool's own binaries. A job whose key is unchanged and whose output is still on disk is
// not run again, so a build with nothing changed starts the tool not at all, and after a CS2 update only the files
// whose CRC changed are decoded again. changes() lists what was redone and why.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { EXTRACTED, SOURCE, insideRoot } from './paths.mjs'

export const TOOL = process.env.SHADER_DUMP ?? 'C:/dev/tools/shader-dump/shader-dump.exe'
export const DOTNET_ROOT = process.env.DOTNET_ROOT ?? 'C:/dev/tools/dotnet-sdk-10'
export const PAK01 = path.join(SOURCE, 'game/csgo/pak01_dir.vpk')
export const SHADERS_VPK = path.join(SOURCE, 'game/csgo/shaders_vulkan_dir.vpk')
const WORK = path.join(EXTRACTED, 'work')
/** Bump when the meaning of a job's output changes on the pipeline's side (its outputs are then redone). */
const CACHE_VERSION = 1

const env = () => ({ ...process.env, DOTNET_ROOT, DOTNET_CLI_TELEMETRY_OPTOUT: '1', CS2_SOURCE: SOURCE, CS2_EXTRACTED: EXTRACTED })

export function runTool(args) {
  return execFileSync(TOOL, args, { env: env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 })
}

/** Writes `data` to `file` only when its bytes differ from what is there: unchanged outputs keep their dates. */
export function writeIfChanged(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (existsSync(file)) {
    const old = readFileSync(file)
    if (old.length === buf.length && old.equals(buf)) return false
  }
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, buf)
  return true
}

// ── pak01's directory: every file with its CRC32 ────────────────────────────────────────────────────────────────────
let index = null
/**
 * pak01's file list as { files: Set of game paths, crc: Map path → crc32 hex }. Read from the copy's directory on every
 * build (half a second); work/pak01_index.txt is rewritten only when the copy changed.
 */
export function pakIndex() {
  if (index) return index
  const file = path.join(WORK, 'pak01_index.txt')
  const fresh = path.join(WORK, 'pak01_index.new.txt')
  mkdirSync(WORK, { recursive: true })
  runTool(['index', '--vpk', PAK01, '--out', fresh])
  const text = readFileSync(fresh, 'utf8')
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (text !== previous) {
    renameSync(fresh, file)
    // The plain list other scripts read (one path per line).
    writeIfChanged(path.join(WORK, 'pak01_files.txt'), text.split('\n').filter(Boolean).map((l) => l.split('\t')[0]).join('\n') + '\n')
  } else rmSync(fresh)
  const crc = new Map()
  for (const line of text.split('\n')) {
    if (!line) continue
    const [p, c] = line.split('\t')
    crc.set(p, c)
  }
  const changed = previous ? diffIndex(previous, text) : null
  index = { files: new Set(crc.keys()), crc, changed }
  return index
}
/** The files added, removed or changed between two index texts. */
function diffIndex(a, b) {
  const parse = (t) => new Map(t.split('\n').filter(Boolean).map((l) => { const [p, c] = l.split('\t'); return [p, c] }))
  const A = parse(a), B = parse(b)
  const out = { added: [], removed: [], changed: [] }
  for (const [p, c] of B) if (!A.has(p)) out.added.push(p); else if (A.get(p) !== c) out.changed.push(p)
  for (const p of A.keys()) if (!B.has(p)) out.removed.push(p)
  return out
}

// ── The job cache ───────────────────────────────────────────────────────────────────────────────────────────────────
const cacheFile = path.join(WORK, 'cache', 'extract.json')
let cache = null, cacheDirty = false
const redone = []
let toolHash = null
/** The tool's binaries (shader-dump, ValveResourceFormat): a new build of either redoes every job. */
function toolStamp() {
  if (toolHash) return toolHash
  const h = createHash('sha1')
  for (const f of ['shader-dump.dll', 'ValveResourceFormat.dll', 'ValvePak.dll']) {
    const p = path.join(path.dirname(TOOL), f)
    h.update(existsSync(p) ? readFileSync(p) : Buffer.from(f))
  }
  toolHash = h.digest('hex').slice(0, 16)
  return toolHash
}
function loadCache() {
  if (cache) return cache
  cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {}
  return cache
}
/** The game path the CRC is looked up under: compiled resources end in _c, raw files don't. */
const compiled = (kind, p) => (kind === 'raw' ? p : p + '_c')
let sorted = null
/** The pak01 paths under `prefix` (binary search over the sorted list). */
function under(prefix) {
  sorted ??= [...pakIndex().crc.keys()].sort()
  let lo = 0, hi = sorted.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < prefix) lo = mid + 1; else hi = mid }
  const out = []
  for (let i = lo; i < sorted.length && sorted[i].startsWith(prefix); i++) out.push(sorted[i])
  return out
}
/**
 * The files a job reads besides its own: a model's folder (its meshes and morph textures live under <model>/…), a
 * clip's skeletons (read from its output, so known from the second run on).
 */
function depsOf(job, entry) {
  if (job.kind === 'model') return under(job.path.replace(/\.vmdl$/, '/'))
  if (job.kind === 'clip' && entry?.out && existsSync(entry.out)) {
    const clip = JSON.parse(readFileSync(entry.out, 'utf8'))
    return [clip.skeletonName, ...(clip.secondary ?? []).map((s) => s.skeletonName)].filter(Boolean).map((s) => s.replace(/_c$/, '') + '_c')
  }
  return []
}
function keyOf(job, deps) {
  const { crc } = pakIndex()
  const h = createHash('sha1')
  h.update(`${CACHE_VERSION}|${toolStamp()}|${job.kind}|${job.path}|${path.resolve(job.out)}|${crc.get(compiled(job.kind, job.path)) ?? 'missing'}`)
  for (const d of deps) h.update(`|${d}:${crc.get(d) ?? 'missing'}`)
  return h.digest('hex')
}

/** Saves the job cache if this run changed it. */
export function saveCache() {
  if (!cacheDirty) return
  mkdirSync(path.dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(cache))
  cacheDirty = false
}
/** The jobs this run decoded again, with the reason ("new", "source changed", "output missing"). */
export const changes = () => redone

/**
 * Extracts a list of jobs ({ kind, path, out }) from one of the copied VPKs (pak01 unless given) in one run.
 * Jobs from pak01 come from the cache when their key is unchanged and their output exists.
 * @returns the report, by game path: { kind, path, out } or { kind, path, error }
 */
export function extract(jobs, workDir, vpk = PAK01) {
  if (!jobs.length) return new Map()
  const dir = insideRoot(EXTRACTED, workDir)
  for (const j of jobs) insideRoot(EXTRACTED, j.out)
  insideRoot(SOURCE, vpk)
  const cached = vpk === PAK01
  const results = new Map()
  let todo = jobs
  if (cached) {
    const c = loadCache()
    todo = []
    for (const j of jobs) {
      const slot = path.resolve(j.out)
      const prev = c[slot]
      const deps = j.kind === 'clip' ? prev?.deps ?? [] : depsOf(j, null)
      const key = keyOf(j, deps)
      const outOk = prev?.entry && (prev.entry.error || (prev.entry.out && existsSync(prev.entry.out)))
      if (prev && prev.key === key && outOk) { results.set(j.path, prev.entry); continue }
      todo.push(j)
      redone.push({ kind: j.kind, path: j.path, why: !prev ? 'new' : prev.key !== key ? 'source changed' : 'output missing' })
    }
  }
  if (todo.length) {
    mkdirSync(dir, { recursive: true })
    const jobsFile = path.join(dir, 'jobs.json')
    const reportFile = path.join(dir, 'report.json')
    writeFileSync(jobsFile, JSON.stringify(todo))
    process.stdout.write(runTool(['extract', '--vpk', vpk, '--jobs', jobsFile, '--report', reportFile]))
    const report = JSON.parse(readFileSync(reportFile, 'utf8'))
    const byPath = new Map(report.map((r) => [r.path, r]))
    for (const j of todo) {
      const e = byPath.get(j.path)
      if (!e) continue
      results.set(j.path, e)
      if (cached) {
        const deps = depsOf(j, e)
        cache[path.resolve(j.out)] = { key: keyOf(j, deps), deps, entry: e }
        cacheDirty = true
      }
    }
    if (cached) saveCache()
  }
  return results
}

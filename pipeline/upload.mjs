// Uploads the bucket staged by hosting.mjs (work/hosting/publish/, listed in work/hosting/manifest.json) to Cloudflare
// R2 with rclone: only the keys the bucket doesn't have yet, game files (g/) first, then the release (r/<release>/),
// then the pointer (release.json), so a page never sees a release whose files aren't there.
//
//   node upload.mjs [--dry-run]
//
// Only `rclone copy`: nothing in the bucket is ever deleted, and an existing object is never replaced (--immutable;
// a key that is there with other bytes stops the upload). The pointer is the one object replaced, when the release
// changes. Prints what it sent and checks the bucket against the manifest afterwards; writes work/hosting/uploads/.
//
// Needs the rclone remote `combo-r2` (RCLONE_REMOTE) set up by hand (pipeline/README.md, "Upload"); with
// C:\dev\tools\rclone-pass.dpapi present, rclone gets its config password from rclone-password.ps1.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeIfChanged } from './lib/extract.mjs'
import { EXTRACTED, parseArgs } from './lib/paths.mjs'
import { POINTER } from './lib/publish.mjs'

const BUCKET = 'combo-skin-assets'
const REMOTE = `${process.env.RCLONE_REMOTE ?? 'combo-r2'}:${BUCKET}`
const RCLONE = process.env.RCLONE ?? 'C:/dev/tools/rclone-v1.75.2-windows-amd64/rclone.exe'
const PASS_FILE = 'C:/dev/tools/rclone-pass.dpapi'
const HOSTING = path.join(EXTRACTED, 'work', 'hosting')
const STAGE = path.join(HOSTING, 'publish')
const args = parseArgs(process.argv.slice(2))
const dryRun = !!args['dry-run']

/** Never print the account's endpoint (its ID is 32 hex digits) or anything that looks like a key. */
const redact = (s) => String(s).replace(/[0-9a-f]{32,}/gi, '<redacted>')

const common = ['--ask-password=false', '--s3-no-check-bucket']
if (existsSync(PASS_FILE)) {
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rclone-password.ps1')
  common.push('--password-command', `powershell -NoProfile -ExecutionPolicy Bypass -File ${helper}`)
}

function rclone(argv, { json = false } = {}) {
  const r = spawnSync(RCLONE, [...argv, ...common], { encoding: 'utf8', maxBuffer: 1 << 28 })
  if (r.error) throw new Error('rclone: ' + redact(r.error.message))
  if (r.status !== 0) {
    const lines = (r.stderr || '').split('\n').filter(Boolean).slice(-8).map(redact)
    throw new Error(`rclone ${argv[0]} failed (exit ${r.status}):\n  ${lines.join('\n  ')}`)
  }
  return json ? JSON.parse(r.stdout || '[]') : r
}

/** The bucket's objects: key → { bytes, md5 }. */
function listBucket() {
  const list = rclone(['lsjson', REMOTE, '-R', '--files-only', '--fast-list', '--hash', '--hash-type', 'MD5'], { json: true })
  return new Map(list.map((o) => [o.Path, { bytes: o.Size, md5: o.Hashes?.md5 ?? o.Hashes?.MD5 ?? null }]))
}

const mb = (n) => (n / 1e6).toFixed(1) + ' MB'
const sum = (list) => list.reduce((s, f) => s + f.bytes, 0)
const area = (key) => (key === POINTER ? 'pointer' : key.startsWith('g/') ? 'g/ (game files)' : 'r/' + key.split('/')[1] + '/ (release)')

// The staged files must be what the manifest says (hosting.mjs writes both).
const manifest = JSON.parse(readFileSync(path.join(HOSTING, 'manifest.json'), 'utf8'))
for (const f of manifest.files) {
  const file = path.join(STAGE, f.key)
  if (!existsSync(file) || statSync(file).size !== f.bytes) throw new Error(`${f.key} isn't staged as listed: run hosting.mjs again`)
}
const pointer = JSON.parse(readFileSync(path.join(STAGE, POINTER), 'utf8'))
if (pointer.release !== manifest.release) throw new Error(`the staged ${POINTER} names ${pointer.release}, the manifest ${manifest.release}`)

console.log(`release ${manifest.release}: ${manifest.files.length} files, ${mb(sum(manifest.files))} staged`)
const before = listBucket()
console.log(`bucket ${BUCKET}: ${before.size} objects, ${mb([...before.values()].reduce((s, o) => s + o.bytes, 0))}`)

const send = [], conflicts = []
for (const f of manifest.files) {
  const there = before.get(f.key)
  if (!there) send.push(f)
  else if (there.bytes !== f.bytes || (there.md5 && there.md5 !== f.md5)) (f.key === POINTER ? send : conflicts).push(f)
}
if (conflicts.length) {
  console.error(`${conflicts.length} keys are in the bucket with other bytes (never replaced), for example:\n  ${conflicts.slice(0, 5).map((f) => f.key).join('\n  ')}`)
  process.exit(1)
}
const listed = new Set(manifest.files.map((f) => f.key))
const others = [...before.keys()].filter((k) => !listed.has(k))

const report = (title, list) => {
  console.log(`${title}: ${list.length} files, ${mb(sum(list))}`)
  const by = {}
  for (const f of list) { const a = area(f.key); (by[a] ??= []).push(f) }
  for (const [a, l] of Object.entries(by)) console.log(`  ${a.padEnd(28)} ${String(l.length).padStart(5)} files ${mb(sum(l)).padStart(10)}`)
  const types = {}
  for (const f of list) { const t = `${f.contentType} | ${f.cacheControl}`; (types[t] ??= []).push(f) }
  for (const [t, l] of Object.entries(types)) console.log(`    ${t.padEnd(70)} ${String(l.length).padStart(5)}`)
}
report(dryRun ? 'would send' : 'to send', send)
console.log(`already in the bucket: ${manifest.files.length - send.length} of the manifest's files; ${others.length} other objects (older releases, kept)`)

// One rclone copy per group of headers, game files first, the pointer last.
const order = (f) => (f.key === POINTER ? 2 : f.key.startsWith('g/') ? 0 : 1)
const groups = new Map()
for (const f of send) {
  const g = `${order(f)}|${f.contentType}|${f.cacheControl}`
  if (!groups.has(g)) groups.set(g, [])
  groups.get(g).push(f)
}
const sent = []
for (const [g, files] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
  const [rank, type, cache] = g.split('|')
  const listFile = path.join(HOSTING, 'uploads', `files-${rank}-${type.replace(/[^a-z0-9]+/gi, '_')}.txt`)
  writeIfChanged(listFile, files.map((f) => f.key).join('\n') + '\n')
  const argv = ['copy', STAGE, REMOTE, '--files-from-raw', listFile, '--no-traverse', '--checksum', '--transfers', '16', '--checkers', '16',
    '--header-upload', `Content-Type: ${type}`, '--header-upload', `Cache-Control: ${cache}`, '--use-json-log', '--log-level', 'INFO', '--stats', '0']
  if (rank !== '2') argv.push('--immutable') // the pointer is the one object that is replaced
  if (dryRun) argv.push('--dry-run')
  const r = rclone(argv)
  const done = (r.stderr || '').split('\n').filter((l) => /Copied \((new|replaced)|Skipped copy as --dry-run/.test(l)).length
  console.log(`  ${dryRun ? 'rclone dry run' : 'sent'}: ${type}, ${cache}: ${done} of ${files.length} files, ${mb(sum(files))}`)
  if (done !== files.length) throw new Error(`rclone reported ${done} of ${files.length} files for ${type}`)
  sent.push(...files)
}
if (dryRun) process.exit(0)

// The bucket against the manifest.
const after = listBucket()
const missing = manifest.files.filter((f) => { const o = after.get(f.key); return !o || o.bytes !== f.bytes || (o.md5 && o.md5 !== f.md5) })
const inBucket = manifest.files.filter((f) => after.has(f.key))
console.log(`bucket now: ${after.size} objects, ${mb([...after.values()].reduce((s, o) => s + o.bytes, 0))}; the manifest's ${manifest.files.length} files (${mb(sum(manifest.files))}): ${inBucket.length - missing.length} present with the same size and MD5, ${missing.length} missing or different`)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeIfChanged(path.join(HOSTING, 'uploads', `${stamp}.json`), JSON.stringify({ release: manifest.release, sent: sent.map((f) => ({ key: f.key, bytes: f.bytes })), bucket: { objects: after.size } }, null, 1))
console.log(sent.length ? `sent ${sent.length} files, ${mb(sum(sent))}${sent.some((f) => f.key === POINTER) ? `; ${POINTER} now names ${manifest.release}` : ''}` : 'nothing to send: the bucket already has this release')
if (missing.length) process.exit(1)

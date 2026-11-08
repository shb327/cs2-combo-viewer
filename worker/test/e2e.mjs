// End to end on this machine, with the real browser and the assets from R2, against the fake API:
//   1. per test combo: a cold shot (a new browser and profile) and warm shots (the same browser), each capture checked
//      against the browser's own screenshot of the page;
//   2. the worker itself (`node src/main.mjs --once`) through a queue of the four combos, its PNGs checked as the API
//      checks them and against the captures of step 1.
// Needs `npm run build` first. Settings: E2E_OUT (where the PNGs and timings go, default test/.tmp/e2e),
// E2E_PROFILES (the browser profiles, default test/.tmp/profiles), CHROME_PATH.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readConfig } from '../src/config.mjs'
import { createLog } from '../src/log.mjs'
import { blankReason, decode, difference, header, texts } from '../src/png.mjs'
import { createRenderer } from '../src/renderer.mjs'
import { serveViewer } from '../src/server.mjs'
import { comboFor } from '../src/job.mjs'
import { startFakeApi } from './fake-api.mjs'

const here = import.meta.dirname
const root = path.resolve(here, '..')
const out = path.resolve(process.env.E2E_OUT || path.join(here, '.tmp', 'e2e'))
const profiles = path.resolve(process.env.E2E_PROFILES || path.join(here, '.tmp', 'profiles'))
const build = JSON.parse(readFileSync(path.join(root, 'viewer-dist', 'worker-build.json'), 'utf8'))
const chromePath = readConfig({ COMBO_WORKER_TOKEN: 'csw_' + 'x'.repeat(43), COMBO_API_URL: 'http://127.0.0.1:1', CHROME_PATH: process.env.CHROME_PATH }).chromePath
mkdirSync(out, { recursive: true })

const kimono = { def_index: 5034, paint_index: 10033, float: 0.15, seed: 269, name: 'Specialist Gloves | Crimson Kimono' }
const ruby = { def_index: 507, paint_index: 415, float: 0.01, seed: 1, name: 'Karambit | Doppler (Ruby)' }
const ricksaw = { def_index: 5404, name: 'Lt. Commander Ricksaw | NSWC SEAL', default: true }
const COMBOS = [
  { name: 'reference', glove: kimono, knife: ruby, agent: ricksaw },
  { name: 'big-swell', glove: { def_index: 5034, paint_index: 1437, float: 0.07, seed: 1, name: 'Specialist Gloves | Big Swell' }, knife: ruby, agent: ricksaw },
  { name: 'vanilla-butterfly', glove: kimono, knife: { def_index: 515, paint_index: 0, float: null, seed: null, name: 'Butterfly Knife' }, agent: ricksaw },
  { name: 'darryl', glove: kimono, knife: ruby, agent: { def_index: 4613, name: 'Bloody Darryl The Strapped', default: false } },
]
const WARM_SHOTS = 3
const log = createLog()
const failures = []
const check = (ok, what) => { if (!ok) failures.push(what); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`) }

/** A job for a test combo, as the fake API sends it. */
const jobFor = (c) => ({ job_id: 'e2e', combo_id: c.name, image: { width: 1920, height: 1080, type: 'image/png' }, glove: c.glove, knife: c.knife, agent: c.agent, render_revision: 1 })

// 1. Cold and warm, and the capture against the page.
const server = await serveViewer(path.join(root, 'viewer-dist'))
const timings = []
const captures = new Map()
try {
  for (const c of COMBOS) {
    const profileDir = path.join(profiles, `cold-${c.name}`)
    rmSync(profileDir, { recursive: true, force: true })
    const renderer = createRenderer({ viewerUrl: server.url, release: build.release, chromePath, profileDir, log })
    const startedAt = Date.now()
    const { gpu } = await renderer.start()
    const browserMs = Date.now() - startedAt
    try {
      const combo = comboFor(jobFor(c))
      const cold = await renderer.render(combo, { id: `${c.name}-cold`, timeoutMs: 120_000 })
      const page = await renderer.pageScreenshot()
      writeFileSync(path.join(out, `${c.name}-capture.png`), cold.png)
      writeFileSync(path.join(out, `${c.name}-page.png`), page)
      captures.set(c.name, cold.png)
      const h = header(cold.png)
      check(h.width === 1920 && h.height === 1080, `${c.name}: capture is ${h.width}x${h.height}`)
      check(blankReason(decode(cold.png)) === null, `${c.name}: capture not blank (3D view covers ${cold.coverage})`)
      const d = difference(decode(cold.png), decode(page))
      check(d.mean < 2 && d.off < 0.01, `${c.name}: capture matches the page (mean difference ${d.mean.toFixed(3)}, ${(d.off * 100).toFixed(3)}% of pixels off)`)
      const warm = []
      for (let i = 0; i < WARM_SHOTS; i++) {
        // Another combo in between, as in a queue, so the warm shot loads its combo again (its files from the cache).
        await renderer.render(comboFor(jobFor(COMBOS[(COMBOS.indexOf(c) + 1) % COMBOS.length])), { id: `${c.name}-between-${i}`, timeoutMs: 120_000 })
        const w = await renderer.render(combo, { id: `${c.name}-warm-${i}`, timeoutMs: 120_000 })
        warm.push(w.ms)
        const dw = difference(decode(cold.png), decode(w.png))
        check(dw.mean < 0.5, `${c.name}: warm shot ${i + 1} equals the cold one (mean difference ${dw.mean.toFixed(3)})`)
      }
      if (c.name === 'reference') {
        // Both seeds given as 0: what a job without seeds (null) must draw (the viewer's default).
        const zero = await renderer.render({ ...combo, knife_seed: 0, gloves_seed: 0 }, { id: 'seed-zero', timeoutMs: 120_000 })
        captures.set('no-seeds', zero.png)
      }
      timings.push({ combo: c.name, gpu, browserStartMs: browserMs, coldMs: cold.ms, warmMs: warm })
      console.log(`     ${c.name}: browser ${browserMs} ms, cold ${cold.ms} ms, warm ${warm.join(' / ')} ms`)
    } finally {
      await renderer.close()
    }
  }
} finally {
  await server.close()
}

// 2. The worker through a queue.
const fake = await startFakeApi()
const token = fake.addWorker('e2e')
// The four, and the reference without seeds (null: the viewer's default, compared with an explicit 0 above).
const queue = [...COMBOS, { name: 'no-seeds', glove: { ...kimono, seed: null }, knife: { ...ruby, seed: null }, agent: ricksaw }]
const ids = new Map(queue.map((c) => [fake.addCombo({ combo_id: c.name.replace(/[^a-z0-9]/g, '').slice(0, 12).padEnd(12, '0'), glove: c.glove, knife: c.knife, agent: c.agent }), c.name]))
const profileDir = path.join(profiles, 'run')
rmSync(profileDir, { recursive: true, force: true })
const started = Date.now()
const child = spawn(process.execPath, [path.join(root, 'src', 'main.mjs'), '--once'], {
  cwd: root,
  env: { ...process.env, COMBO_API_URL: fake.url, COMBO_WORKER_TOKEN: token, WORKER_PROFILE_DIR: profileDir, WORKER_RENDER_TIMEOUT: '120', CHROME_PATH: chromePath },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.on('data', (d) => { output += d; process.stdout.write(d) })
child.stderr.on('data', (d) => { output += d; process.stderr.write(d) })
const code = await new Promise((r) => child.on('exit', r))
const runMs = Date.now() - started
await fake.close()

check(code === 0, `worker exit code ${code}`)
check(!output.includes(token) && !output.includes(token.slice(4)), 'the token is not in the worker\'s output')
check(fake.events.filter((e) => e.type === 'stored').length === queue.length, `${queue.length} screenshots stored (${fake.events.map((e) => e.type).join(', ')})`)
const stored = []
for (const [id, name] of ids) {
  const png = fake.stored.get(id)
  if (!png) { check(false, `${name}: nothing stored`); continue }
  const t = texts(png)
  check(t['cs3d-release'] === build.release && t['combo-id'] === id && t['cs3d-render-revision'] === '1', `${name}: text chunks ${JSON.stringify(t)}`)
  const d = difference(decode(png), decode(captures.get(name)))
  check(d.mean < 0.5, `${name}: the worker's PNG equals step 1's capture (mean difference ${d.mean.toFixed(3)})`)
  const file = path.join(out, `${name}.png`)
  writeFileSync(file, png)
  stored.push({ combo: name, bytes: png.length, file })
}
const shots = [...output.matchAll(/stored job=\S+ combo=(\S+) bytes=(\d+) ms=(\d+)/g)].map((m) => ({ combo: ids.get(m[1]), ms: Number(m[3]) }))
writeFileSync(path.join(out, 'timings.json'), JSON.stringify({ release: build.release, viewerCommit: build.commit, at: new Date().toISOString(), timings, run: { totalMs: runMs, shots }, stored, failures }, null, 2) + '\n')
console.log(`\nworker run: ${runMs} ms in all; per shot ${shots.map((s) => `${s.combo} ${s.ms} ms`).join(', ')}`)
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)

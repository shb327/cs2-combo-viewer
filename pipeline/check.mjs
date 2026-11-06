// Checks every built knife finish, glove finish and agent in the viewer, in headless Chrome, and writes contact sheets
// and a coverage report. Needs the viewer running (production build: cd viewer; npm.cmd run build; npm.cmd run preview).
//
//   node check.mjs [--base http://127.0.0.1:5321] [--only knives|gloves|agents|fp] [--item <item>] [--redo] [--sheets] [--shaders]
//                  [--out <name>] [--assets <url>]  (another run's folder and results, and where its assets come from:
//                  e.g. --out p3b --assets https://assets.combo.skin/ for the build on the hosted assets)
//
// Each item loads in the embed on a transparent background; it passes when the embed posts cs3d:loaded, no error,
// exception, shader error or failed asset request was logged, and the render is neither missing (almost no covered
// pixels), black, white nor one flat colour. Results are kept per item (work/check/results.json): a second run checks
// only what has no result yet (--redo checks all again). --sheets only rebuilds the sheets and the report.
//
// Writes only under C:/cs2-data (OUT: reference/compare/p3; the profile and results under extracted/work/check).
// Launches its own Chrome with its own profile and closes it at the end.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readPng } from './lib/image.mjs'
import { EXTRACTED, REFERENCE, VIEWER_DATA, insideRoot, parseArgs } from './lib/paths.mjs'

const args = parseArgs(process.argv.slice(2))
const BASE = args.base ?? 'http://127.0.0.1:5321'
const RUN = typeof args.out === 'string' ? args.out.replace(/[^\w-]/g, '') : 'p3'
const OUT = insideRoot(path.dirname(REFERENCE), path.join(REFERENCE, 'compare', RUN))
const WORK = path.join(EXTRACTED, 'work', 'check')
const SHOTS = path.join(OUT, 'shots')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(WORK, { recursive: true })
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const index = readJson(path.join(VIEWER_DATA, 'index.json'))
const agentIndex = readJson(path.join(VIEWER_DATA, 'agents.json'))
const resultsFile = path.join(WORK, RUN === 'p3' ? 'results.json' : `results-${RUN}.json`)
/** Asset requests (their failures count), and the part of their URL a report leaves out. */
const ASSET_URL = typeof args.assets === 'string' ? new RegExp('^' + args.assets.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')) : /^.*\/assets\//
const isAsset = (url) => ASSET_URL.test(url ?? '')
const results = existsSync(resultsFile) && !args.redo ? readJson(resultsFile) : {}

// ── The checks ─────────────────────────────────────────────────────────────────────────────────────────────────────
const enc = encodeURIComponent
const DEFAULT_GLOVES = 'specialist_gloves|specialist_kimono_diamonds_red'
const DEFAULT_KNIFE = 'weapon_knife_karambit|vanilla'
const common = 'ui=0&bg=transparent&auto_rotate=0&viewmodel_sway=0'
const jobs = []
for (const s of index.skins) {
  const type = index.items[s.item]?.type
  const group = type === 'Gloves' ? 'gloves' : 'knives'
  jobs.push({ id: `${s.item}|${s.kit}`, group, type: s.item, label: s.name, size: [480, 360], url: `/embed?skin=${enc(`${s.item}|${s.kit}`)}&view=orbit&seed=1&float=0.05&${common}` })
}
// Each knife in first person (its pose and clips) and each agent's arms (with the agent's own gloves, holding a knife).
for (const [item, info] of Object.entries(index.items)) {
  if (info.type !== 'Knife') continue
  jobs.push({ id: `fp:${item}`, group: 'fp', type: 'first person', label: info.displayName, size: [640, 360], url: `/embed?skin=${enc(`${item}|vanilla`)}&view=fpv&loadout_gloves=${enc(DEFAULT_GLOVES)}&loadout_gloves_seed=269&loadout_gloves_float=0.15&${common}` })
}
for (const a of agentIndex.agents) {
  jobs.push({ id: `agent:${a.id}`, group: 'agents', type: a.team === 't' ? 'agents (T)' : 'agents (CT)', label: a.name, size: [640, 360], url: `/embed?skin=${enc(DEFAULT_KNIFE)}&view=fpv&loadout_agent=${enc(a.id)}&${common}` })
}
const todo = jobs.filter((j) => (!args.only || j.group === args.only) && (!args.item || j.id.includes(args.item)) && (!results[j.id] || args.redo))

/** The render's pixels: coverage (alpha), and how black, white or flat the covered part is. */
function analyse(png) {
  const img = readPng(png)
  const { w, h, data, channels } = img
  let covered = 0, black = 0, white = 0, sum = 0, sum2 = 0
  for (let i = 0; i < w * h; i++) {
    const a = channels === 4 ? data[i * 4 + 3] : 255
    if (a < 16) continue
    const r = data[i * channels], g = data[i * channels + 1], b = data[i * channels + 2]
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    covered++
    if (l < 10) black++
    if (r > 245 && g > 245 && b > 245) white++
    sum += l; sum2 += l * l
  }
  const n = Math.max(1, covered)
  const mean = sum / n
  return { coverage: covered / (w * h), black: black / n, white: white / n, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) }
}
function verdict(r) {
  const why = []
  if (!r.loaded) why.push(r.error ? `error: ${r.error}` : 'never loaded')
  if (r.exceptions.length) why.push(`exception: ${r.exceptions[0]}`)
  if (r.shaderErrors.length) why.push(`shader: ${r.shaderErrors[0].slice(0, 200)}`)
  if (r.failedRequests.length) why.push(`missing file: ${r.failedRequests[0]}`)
  const p = r.pixels
  if (p) {
    if (p.coverage < 0.005) why.push('render: missing (nothing drawn)')
    else if (p.black > 0.9) why.push('render: black')
    else if (p.white > 0.9) why.push('render: white')
    else if (p.std < 2) why.push('render: one flat colour')
  }
  return why
}

// ── Chrome over the DevTools protocol ──────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function withChrome(fn) {
  const port = 9341
  const profile = path.join(WORK, 'chrome-profile')
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-angle=d3d11', '--enable-gpu',
    '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  try {
    let target
    for (let i = 0; i < 100 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {} }
    if (!target) throw new Error('Chrome did not start')
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((r) => (ws.onopen = r))
    let id = 0
    const pending = new Map()
    const listeners = new Set()
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
      if (m.method) for (const l of listeners) l(m)
    }
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
    // The embed posts its events to its parent page: a stand-in parent that logs them.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const fake = { postMessage: (d) => { try { console.log('CS3D ' + JSON.stringify({ type: d && d.type, message: d && d.message })) } catch (e) {} } }; try { Object.defineProperty(window, 'parent', { get: () => fake, configurable: true }) } catch (e) {} })()` })
    try { await fn({ send, listeners }) } finally { ws.close() }
  } finally {
    proc.kill()
    await sleep(500)
  }
}

async function runJob({ send, listeners }, job) {
  const r = { loaded: false, error: null, exceptions: [], shaderErrors: [], errors: [], failedRequests: [], ms: 0 }
  const reqs = new Map()
  const l = (m) => {
    const p = m.params
    if (m.method === 'Runtime.consoleAPICalled') {
      const s = p.args.map((a) => a.value ?? a.description).join(' ')
      if (s.startsWith('CS3D ')) {
        const msg = JSON.parse(s.slice(5))
        if (msg.type === 'cs3d:loaded') r.loaded = true
        if (msg.type === 'cs3d:error') r.error = msg.message
      } else if (p.type === 'error') {
        if (/Shader Error|ERROR: 0:|Program Info Log|not exported/i.test(s)) r.shaderErrors.push(s)
        else r.errors.push(s.slice(0, 300))
      }
    }
    if (m.method === 'Runtime.exceptionThrown') r.exceptions.push(String(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).slice(0, 300))
    if (m.method === 'Network.requestWillBeSent') reqs.set(p.requestId, p.request.url)
    if (m.method === 'Network.responseReceived' && p.response.status >= 400 && isAsset(p.response.url)) r.failedRequests.push(`${p.response.status} ${p.response.url.replace(ASSET_URL, '')}`)
    if (m.method === 'Network.loadingFailed' && isAsset(reqs.get(p.requestId)) && !p.canceled) r.failedRequests.push(`${p.errorText}${p.corsErrorStatus ? ' (CORS ' + p.corsErrorStatus.corsError + ')' : ''} ${reqs.get(p.requestId).replace(ASSET_URL, '')}`)
  }
  listeners.add(l)
  const [w, h] = job.size
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  const t0 = Date.now()
  await send('Page.navigate', { url: BASE + job.url })
  while (!r.loaded && !r.error && Date.now() - t0 < 90000) await sleep(100)
  r.ms = Date.now() - t0
  // A moment for the last textures to decode and the frame to settle.
  await sleep(r.loaded ? 800 : 0)
  // The embed's own screenshot (cs3d:screenshot): the view without the studio backdrop, transparent where nothing is
  // drawn. The page asks itself; the embed replies to the sender. Falls back to the page's pixels.
  let png = null
  if (r.loaded) {
    const ev = await send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true, expression: `new Promise((res) => {
        const t = setTimeout(() => res(null), 10000)
        addEventListener('message', (e) => { if (e.data && e.data.type === 'cs3d:screenshot' && e.data.dataUrl) { clearTimeout(t); res(e.data.dataUrl) } })
        postMessage({ type: 'cs3d:screenshot', id: 'check' }, '*')
      })`,
    })
    const url = ev.result?.result?.value
    if (url) png = Buffer.from(url.split(',')[1], 'base64')
  }
  if (!png) png = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')
  listeners.delete(l)
  const file = path.join(SHOTS, job.id.replace(/[|:]/g, '__') + '.png')
  writeFileSync(file, png)
  r.shot = path.relative(OUT, file).replace(/\\/g, '/')
  r.pixels = analyse(png)
  r.problems = verdict(r)
  // Navigating away from a loaded WebGL page frees its context.
  await send('Page.navigate', { url: 'about:blank' })
  return r
}

/**
 * Every compositing shader, compiled and linked in the browser as the viewer would (GLSL ES 3.00 under WebGL2), each
 * with a vertex shader that writes the inputs it reads; the time each took (link status read at once, so the time is
 * the driver's whole compile). Results in work/check/shaders.json.
 */
async function checkShaders() {
  const files = readdirSync(path.join(VIEWER_DATA, 'shaders')).filter((f) => f.endsWith('.frag.glsl'))
  let out
  await withChrome(async ({ send }) => {
    await send('Page.navigate', { url: `${BASE}/assets/extracted/viewer/index.json` })
    await sleep(1000)
    const ev = await send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true, expression: `(async () => {
        const files = ${JSON.stringify(files)}
        let gl = document.createElement('canvas').getContext('webgl2')
        const results = []
        for (const f of files) {
          // A lost context (the driver resets after a long compile) fails every later shader with an empty log: take a new one.
          if (gl.isContextLost()) gl = document.createElement('canvas').getContext('webgl2')
          const text = (await (await fetch('/assets/extracted/viewer/shaders/' + f)).text()).replace(/\\r\\n/g, '\\n')
          const frag = text.startsWith('// combo ') ? text.slice(text.indexOf('\\n') + 1) : text
          const ins = [...frag.matchAll(/^\\s*(flat\\s+)?in\\s+(\\w+)\\s+(\\w+)\\s*;/gm)]
          const vs = '#version 300 es\\nin vec3 position;\\n' + ins.map((m) => (m[1] ? 'flat ' : '') + 'out ' + m[2] + ' ' + m[3] + ';').join('\\n')
            + '\\nvoid main() {\\n' + ins.map((m) => '  ' + m[3] + ' = ' + m[2] + '(0);').join('\\n') + '\\n  gl_Position = vec4(position, 1.0);\\n}'
          const t = performance.now()
          const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s }
          const v = sh(gl.VERTEX_SHADER, vs), fr = sh(gl.FRAGMENT_SHADER, '#version 300 es\\n' + frag)
          const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, fr); gl.linkProgram(p)
          const ok = gl.getProgramParameter(p, gl.LINK_STATUS)
          const ms = performance.now() - t
          const contextLost = gl.isContextLost()
          results.push({ f, ok, ms: Math.round(ms), lines: frag.split('\\n').length, contextLost, log: ok ? '' : (gl.getShaderInfoLog(fr) || gl.getProgramInfoLog(p) || (contextLost ? 'context lost' : '')).slice(0, 400) })
          gl.deleteProgram(p); gl.deleteShader(v); gl.deleteShader(fr)
        }
        return results
      })()`,
    })
    out = ev.result?.result?.value ?? ev.result
  })
  writeFileSync(path.join(WORK, 'shaders.json'), JSON.stringify(out, null, 1))
  if (!Array.isArray(out)) { console.log('shader check failed', JSON.stringify(out).slice(0, 500)); return }
  const bad = out.filter((r) => !r.ok)
  const slow = [...out].sort((a, b) => b.ms - a.ms).slice(0, 5)
  console.log(`shaders: ${out.length} compiled and linked, ${bad.length} failed, ${(out.reduce((s, r) => s + r.ms, 0) / 1000).toFixed(1)} s in all`)
  for (const r of bad) console.log(`  ${r.f}: ${r.log}`)
  console.log(`  slowest: ${slow.map((r) => `${r.f} ${r.ms} ms (${r.lines} lines)`).join(', ')}`)
}
if (args.shaders) { await checkShaders(); process.exit(0) }

if (!args.sheets && todo.length) {
  console.log(`check: ${todo.length} of ${jobs.length} items to load`)
  const t0 = Date.now()
  let n = 0
  await withChrome(async (cdp) => {
    for (const job of todo) {
      const r = await runJob(cdp, job)
      results[job.id] = { ...r, group: job.group, type: job.type, label: job.label, url: job.url }
      n++
      if (r.problems.length) console.log(`  ${job.id}: ${r.problems.join('; ')}`)
      if (n % 20 === 0 || n === todo.length) {
        writeFileSync(resultsFile, JSON.stringify(results))
        console.log(`  ${n}/${todo.length}, ${((Date.now() - t0) / 1000 / n).toFixed(1)} s each`)
      }
    }
  })
  writeFileSync(resultsFile, JSON.stringify(results))
}

// ── Contact sheets and the report ──────────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const byType = new Map()
for (const j of jobs) {
  const r = results[j.id]
  if (!r) continue
  const key = `${j.group}/${j.type}`
  if (!byType.has(key)) byType.set(key, [])
  byType.get(key).push({ ...j, r })
}
const sheetCss = `body{margin:0;background:#1b1d21;color:#ddd;font:12px system-ui,sans-serif}h1{font-size:16px;margin:10px 12px}
.g{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px}.c{width:240px;background:#2a2d33;border-radius:4px;overflow:hidden}
.c img{display:block;width:240px;height:180px;object-fit:contain;background:#3a3e46}.c.w img{height:135px}
.c div{padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bad{outline:2px solid #e5484d}.bad div{color:#ff8b8b}`
const sheets = []
for (const [key, list] of byType) {
  const name = key.replace(/[^a-z0-9_]+/gi, '_')
  const cards = list.map(({ label, id, r, size }) => `<div class="c${size[0] > 480 ? ' w' : ''}${r.problems.length ? ' bad' : ''}" title="${esc(id + (r.problems.length ? '\n' + r.problems.join('\n') : ''))}"><img src="${esc(r.shot)}"><div>${esc(label)}</div></div>`).join('')
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(key)}</title><style>${sheetCss}</style><h1>${esc(list[0].type)} (${list.length}, ${list.filter((x) => x.r.problems.length).length} with problems)</h1><div class="g">${cards}</div>`
  writeFileSync(path.join(OUT, `${name}.html`), html)
  sheets.push({ key, name, count: list.length, bad: list.filter((x) => x.r.problems.length).length })
}
writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Phase 3 contact sheets</title><style>${sheetCss} a{color:#9cf}</style><h1>Contact sheets</h1><ul>${sheets.map((s) => `<li><a href="${s.name}.html">${esc(s.key)}</a>: ${s.count}${s.bad ? `, <b>${s.bad} with problems</b>` : ''}</li>`).join('')}</ul>`)

// PNG sheets: each HTML sheet rendered full page.
if (sheets.length && !args['no-png']) {
  await withChrome(async ({ send }) => {
    for (const s of sheets) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1260, height: 800, deviceScaleFactor: 1, mobile: false })
      await send('Page.navigate', { url: 'file:///' + path.join(OUT, `${s.name}.html`).replace(/\\/g, '/') })
      await sleep(1500)
      const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })
      const height = Math.min(16000, result.value)
      await send('Emulation.setDeviceMetricsOverride', { width: 1260, height, deviceScaleFactor: 1, mobile: false })
      await sleep(500)
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      writeFileSync(path.join(OUT, `sheet-${s.name}.png`), Buffer.from(shot.result.data, 'base64'))
    }
  })
}

const all = jobs.map((j) => ({ ...j, r: results[j.id] }))
const checked = all.filter((x) => x.r)
const failed = checked.filter((x) => x.r.problems.length)
const summary = {}
for (const x of all) {
  const s = (summary[x.group] ??= { items: 0, checked: 0, passed: 0, failed: 0, avgLoadMs: 0 })
  s.items++
  if (!x.r) continue
  s.checked++
  if (x.r.problems.length) s.failed++; else s.passed++
  s.avgLoadMs += x.r.ms
}
for (const s of Object.values(summary)) s.avgLoadMs = Math.round(s.avgLoadMs / Math.max(1, s.checked))
writeFileSync(path.join(OUT, 'check-summary.json'), JSON.stringify({ summary, failed: failed.map((x) => ({ id: x.id, problems: x.r.problems })) }, null, 1))
console.log(JSON.stringify(summary, null, 1))
console.log(`${failed.length} with problems; sheets in ${OUT}`)

// The coverage report: the catalog against what was built (work/build-report.json) and against the game files, the
// check's results and the shader check's (when run).
{
  const report = readJson(path.join(EXTRACTED, 'work', 'build-report.json'))
  const shaders = existsSync(path.join(WORK, 'shaders.json')) ? readJson(path.join(WORK, 'shaders.json')) : null
  const entries = report.catalogEntries
  const count = (cat) => entries.filter((e) => e.category === cat).length
  const builtKnives = report.built.knives.reduce((s, k) => s + k.kits.length, 0)
  const builtGloves = report.built.gloves.reduce((s, g) => s + g.kits.length, 0)
  const g = (k) => summary[k] ?? { items: 0, checked: 0, passed: 0, failed: 0, avgLoadMs: 0 }
  const lines = [
    '# Coverage (phase 3A)', '',
    `Catalog: ${report.catalog.repo} @ ${report.catalog.commit}. Generated by pipeline/check.mjs on ${new Date().toISOString().slice(0, 10)}.`, '',
    '| Kind | In the catalog | Built | Failed to build | Checked in the viewer | Passed | With problems | Average load |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| Knife finishes (${report.built.knives.length} knives) | ${count('Knives')} | ${builtKnives} | ${report.failures.filter((f) => f.item.includes('knife') || f.item === 'weapon_bayonet').length} | ${g('knives').checked} | ${g('knives').passed} | ${g('knives').failed} | ${(g('knives').avgLoadMs / 1000).toFixed(1)} s |`,
    `| Glove finishes (${report.built.gloves.length} gloves) | ${count('Gloves')} | ${builtGloves} | ${report.failures.filter((f) => /glove|handwrap/.test(f.item)).length} | ${g('gloves').checked} | ${g('gloves').passed} | ${g('gloves').failed} | ${(g('gloves').avgLoadMs / 1000).toFixed(1)} s |`,
    `| Agents (first-person arms) | ${count('Agents')} | ${report.built.agents.length} | ${report.failures.filter((f) => f.item.startsWith('customplayer_')).length} | ${g('agents').checked} | ${g('agents').passed} | ${g('agents').failed} | ${(g('agents').avgLoadMs / 1000).toFixed(1)} s |`,
    `| Knives in first person (pose, idle) | ${report.built.knives.length} | ${report.built.knives.length} | | ${g('fp').checked} | ${g('fp').passed} | ${g('fp').failed} | ${(g('fp').avgLoadMs / 1000).toFixed(1)} s |`,
    '', shaders ? `Shaders: ${shaders.length} compositing shaders compiled and linked in Chrome (WebGL2, ANGLE on D3D11), ${shaders.filter((s) => !s.ok).length} failed.` : 'Shaders: not checked (node check.mjs --shaders).', '',
    '## Failed to build', '', ...(report.failures.length ? report.failures.map((f) => `- ${f.item}${f.kit ? ' | ' + f.kit : ''} (${f.stage}): ${f.error}`) : ['None.']), '',
    '## With problems in the viewer', '', ...(failed.length ? failed.map((x) => `- ${x.id}: ${x.r.problems.join('; ')}`) : ['None.']), '',
    '## In the catalog, not in the game files', '', ...(report.catalogProblems.length ? report.catalogProblems.map((p) => `- ${p.name} (${p.category}, ${p.defindex}/${p.paintIndex ?? '-'}): ${p.problem}`) : ['None: every entry resolves to an item and a paint kit in items_game.']), '',
    '## In the game files, not in the catalog', '',
    report.gameOnly?.finishes.length ? `Knife and glove finishes with an item image of their own: ${report.gameOnly.finishes.length}` : 'Knife and glove finishes: none (every finish with an item image in the game is in the catalog).', '',
    ...(report.gameOnly?.finishes ?? []).map((f) => `- ${f}`),
    `Agents: ${report.gameOnly?.agents.length ?? 0} customplayer items, all ${[...new Set((report.gameOnly?.agents ?? []).map((a) => a.name))].join(' / ')} (map-based defaults on ${new Set((report.gameOnly?.agents ?? []).map((a) => a.model)).size} models); not built.`, '',
    ...(report.gameOnly?.agents ?? []).map((a) => `- ${a.item} (${a.defindex}): ${a.name}, ${a.model}`), '',
  ]
  writeFileSync(path.join(OUT, 'coverage.md'), lines.join('\n'))
  console.log(`coverage report: ${path.join(OUT, 'coverage.md')}`)
}


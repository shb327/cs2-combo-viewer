// The reference check: `npm run refcheck -- --refs <folder> --out <folder>` (worker/README.md, "Reference check").
// Draws every knife in the reference folder's manifest with the worker's own viewer build (front and back, and the
// same knife vanilla for its painted parts), lines each render up with its reference picture by the outline, scores
// the painted parts, and writes the report to --out.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_CHROME } from '../config.mjs'
import { serveViewer } from '../server.mjs'
import { checkPicture, likelyCause, paintedMask } from './check.mjs'
import { decodePng, encodePng } from './image.mjs'
import { readManifest, slug } from './manifest.mjs'
import { createSideRenderer, HOST_PAGE, HOST_PATH } from './render.mjs'
import { contactCell, pairSheet, writeReport } from './report.mjs'
import { FLAG_BELOW } from './score.mjs'

/** The viewer's own dev port: the asset bucket's CORS allows only 5320 and 5321, and 5321 is the worker's. */
const PORT = 5320
const here = import.meta.dirname

const USAGE = 'Usage: npm run refcheck -- --refs <folder with manifest.csv> --out <report folder> [--only <text>] [--fresh] [--sheets flagged|all] [--viewer-dist <build>]'

async function main() {
  const { values: args } = parseArgs({
    options: {
      refs: { type: 'string' },
      out: { type: 'string' },
      'viewer-dist': { type: 'string', default: path.resolve(here, '..', '..', 'viewer-dist') },
      only: { type: 'string' },
      fresh: { type: 'boolean', default: false },
      sheets: { type: 'string', default: 'flagged' },
      'long-side': { type: 'string', default: '1400' },
    },
  })
  if (!args.refs || !args.out) { console.error(USAGE); process.exit(2) }

  const refsDir = path.resolve(args.refs), outDir = path.resolve(args.out)
  const dist = path.resolve(args['viewer-dist'])
  const build = JSON.parse(readFileSync(path.join(dist, 'worker-build.json'), 'utf8'))
  const buildId = `${build.release}-${build.commit ?? createHash('sha1').update(readFileSync(path.join(dist, 'index.html'))).digest('hex').slice(0, 12)}`
  const manifest = readManifest(readFileSync(path.join(refsDir, 'manifest.csv'), 'utf8'))
    .filter((r) => !args.only || args.only.split(',').some((s) => r.picture.includes(s)))
  if (!manifest.length) throw new Error('no pictures to check')

  const res = await fetch(`${build.assetBase}/r/${build.release}/index.json`)
  if (!res.ok) throw new Error(`the catalog: HTTP ${res.status}`)
  const catalog = await res.json()
  const itemOf = (knife) => {
    const found = Object.entries(catalog.items).find(([, v]) => v.type === 'Knife' && slug(v.displayName) === knife)
    if (!found) throw new Error(`no knife "${knife}" in the catalog`)
    return found[0]
  }
  const skinOf = (item, finish) => {
    const s = catalog.skins.find((k) => k.item === item && slug(k.name) === finish)
    if (!s) throw new Error(`${item}: no finish "${finish}" in the catalog`)
    return s
  }

  // Renders are kept in the report folder by build, so a second run only scores.
  const renderDir = path.join(outDir, 'renders', buildId)
  mkdirSync(renderDir, { recursive: true })
  mkdirSync(path.join(outDir, 'sheets'), { recursive: true })
  const jobs = new Map()
  for (const row of manifest) {
    const item = itemOf(row.knife)
    const skin = skinOf(item, row.finish)
    row.float = Math.min(skin.floatMax, Math.max(skin.floatMin, Number(row.wear)))
    row.renderKey = `${row.knife}-${row.finish}-${row.seed}-${row.float.toFixed(2)}`
    jobs.set(row.renderKey, { key: row.renderKey, item, kit: skin.kit, float: row.float, seed: Number(row.seed) })
    jobs.set(`${row.knife}-vanilla`, { key: `${row.knife}-vanilla`, item, kit: 'vanilla', float: 0, seed: 0 })
  }
  const files = (key) => ({ front: path.join(renderDir, `${key}-front.png`), back: path.join(renderDir, `${key}-back.png`) })
  const todo = [...jobs.values()].filter((j) => args.fresh || !existsSync(files(j.key).back))
  if (todo.length) {
    const server = await serveViewer(dist, { port: PORT, routes: { [HOST_PATH]: { type: 'text/html; charset=utf-8', body: HOST_PAGE } } })
    const renderer = createSideRenderer({
      viewerUrl: server.url,
      chromePath: process.env.CHROME_PATH?.trim() || DEFAULT_CHROME[process.platform],
      profileDir: path.join(os.homedir(), '.cache', 'cs2-combo-worker', 'refcheck-profile'),
      longSide: Number(args['long-side']),
    })
    try {
      await renderer.start()
      let n = 0
      for (const j of todo) {
        const t = Date.now()
        const { front, back } = await renderer.render(j)
        writeFileSync(files(j.key).front, front)
        writeFileSync(files(j.key).back, back)
        console.log(`rendered ${++n}/${todo.length} ${j.key} (${Date.now() - t} ms)`)
      }
    } finally {
      await renderer.close()
      await server.close()
    }
  }

  const load = (key) => ({ front: decodePng(readFileSync(files(key).front)), back: decodePng(readFileSync(files(key).back)) })
  const masks = new Map()
  const rows = [], cells = []
  for (const [n, m] of manifest.entries()) {
    const t = Date.now()
    const renders = load(m.renderKey)
    if (!masks.has(m.renderKey)) {
      const vanilla = load(`${m.knife}-vanilla`)
      masks.set(m.renderKey, { front: paintedMask(renders.front, vanilla.front), back: paintedMask(renders.back, vanilla.back) })
    }
    const ref = decodePng(readFileSync(path.join(refsDir, m.picture)))
    const c = checkPicture({ ref, renders, painted: masks.get(m.renderKey), finish: m.finish })
    const label = (a) => `${a.side}${a.mirror ? ', mirrored' : ''}`
    const row = {
      picture: m.picture, group: m.group, knife: m.knife, finish: m.finish, phase: m.phase ?? '', seed: Number(m.seed),
      wear: m.float, side: m.side,
      arrangement: label(c.chosen), face: c.face, swapped: c.face !== m.side, mirrored: c.chosen.mirror,
      decidedBy: c.decidedBy, iou: c.chosen.iou, score: c.chosen.result.score, result: c.chosen.result,
      otherFace: c.otherSide ? label(c.otherSide) : null,
      otherFaceIou: c.otherSide?.iou ?? null, otherFaceScore: c.otherSide?.result.score ?? null, otherFaceResult: c.otherSide?.result ?? null,
      arrangements: c.arrangements,
    }
    row.flagged = row.score < FLAG_BELOW
    row.cause = likelyCause(row)
    const entry = { row, ref, refMask: c.refMask, chosen: c.chosen, other: c.otherSide }
    cells.push(contactCell(entry))
    if (row.flagged || args.sheets === 'all') writeFileSync(path.join(outDir, 'sheets', m.picture), encodePng(pairSheet(entry)))
    rows.push(row)
    console.log(`checked ${n + 1}/${manifest.length} ${m.picture}: ${row.arrangement} outline ${row.iou.toFixed(3)} score ${row.score.toFixed(2)}${row.flagged ? ' FLAG' : ''} (${Date.now() - t} ms)`)
  }

  writeReport(outDir, rows, cells, { buildId, flagBelow: FLAG_BELOW })
  const flagged = rows.filter((r) => r.flagged).length
  console.log(`${rows.length - flagged} of ${rows.length} pass, ${flagged} flagged. Report: ${path.join(outDir, 'report.md')}`)
}

main().catch((e) => { console.error(e); process.exit(1) })

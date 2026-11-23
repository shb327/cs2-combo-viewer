// The reference check's report: the table (Markdown and CSV, worst first), a side-by-side sheet per flagged pair and
// a contact sheet of every pair.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { outline, paste, rect, text } from './draw.mjs'
import { blank, encodePng, warp } from './image.mjs'

const CELL = { w: 192, h: 144, label: 22 }
const GREEN = [80, 220, 120], RED = [240, 90, 80], GREY = [150, 150, 150]

const fixed = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '' : Number(v).toFixed(d))

/** The numbers behind a score, short. */
export function details(r) {
  if (r.kind === 'patina') return `placement ${fixed(r.placement)}, blue ours ${pct(r.blue.ours)} / ref ${pct(r.blue.ref)}, size ref/ours ${fixed(r.size)}`
  if (r.kind === 'spray') return `placement ${fixed(r.placement)}, contrast ours ${fixed(r.lightness.ours.contrast)} / ref ${fixed(r.lightness.ref.contrast)}, L50 ours ${fixed(r.lightness.ours.p50, 0)} / ref ${fixed(r.lightness.ref.p50, 0)}`
  if (r.kind === 'anodized') return `hue gap ${fixed(r.hueGap, 0)}°, colours ${fixed(r.colour)}, ours ${r.hues.ours.join(' ')} / ref ${r.hues.ref.join(' ')}`
  return r.note ?? ''
}
const pct = (v) => `${Math.round(v * 100)}%`

const name = (row) => `${row.group} ${row.knife} ${row.seed} ${row.side}`

/** The part of the reference's frame around the knife (its outline's box and a margin), at 4:3. */
function frameOf(entry) {
  const { refMask, ref } = entry
  const { width: w, height: h } = ref
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (refMask[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  let bw = (x1 - x0) * 1.08 + 8, bh = (y1 - y0) * 1.08 + 8
  if (bw / bh > 4 / 3) bh = bw * 3 / 4; else bw = bh * 4 / 3
  return { x: (x0 + x1) / 2 - bw / 2, y: (y0 + y1) / 2 - bh / 2, w: bw, h: bh }
}

/** `img` cut to `frame` and scaled to `w` × `h`. */
const crop = (img, frame, w, h) => warp(img, w, h, [frame.w / w, 0, frame.x, 0, frame.h / h, frame.y], [0, 0, 0, 255]).image

/** Our render on the reference's grid with the scored region's edge, as drawn in the sheets. */
function oursPanel(entry, which = 'chosen') {
  const a = entry[which]
  const img = { ...a.image, rgba: a.image.rgba.slice() }
  outline(img, a.region, GREEN)
  return img
}

/** One pair for the contact sheet: the reference over ours, with its name and score. */
export function contactCell(entry) {
  const { row } = entry
  const cell = blank(CELL.w, CELL.h * 2 + CELL.label, [18, 18, 18, 255])
  const frame = frameOf(entry)
  paste(cell, crop(entry.ref, frame, CELL.w, CELL.h), 0, 0)
  paste(cell, crop(oursPanel(entry), frame, CELL.w, CELL.h), 0, CELL.h)
  text(cell, 3, CELL.h * 2 + 3, `${row.group} ${row.knife} ${row.seed} ${row.side[0]}`.slice(0, 31), GREY)
  text(cell, 3, CELL.h * 2 + 13, `${fixed(row.score)} ${row.arrangement}`.slice(0, 31), row.flagged ? RED : GREEN)
  return cell
}

/** A flagged pair side by side: the reference, ours as it fits, and our other side. */
export function pairSheet(entry) {
  const { row } = entry
  const pw = 600, ph = 450, top = 44
  const sheet = blank(pw * 3, ph + top + 16, [12, 12, 12, 255])
  text(sheet, 8, 6, `${name(row)}  ${row.finish}${row.phase ? ' ' + row.phase : ''}  wear ${row.wear}`, [235, 235, 235], 2)
  text(sheet, 8, 28, `score ${fixed(row.score)}  outline ${fixed(row.iou, 3)}  ${details(row.result)}`.slice(0, 296), row.flagged ? RED : GREEN)
  const panels = [
    [entry.ref, `reference (${row.side})`],
    [oursPanel(entry), `ours: ${row.arrangement} (score ${fixed(row.score)})`],
    entry.other ? [oursPanel(entry, 'other'), `ours: ${row.otherFace} (score ${fixed(row.otherFaceScore)}, outline ${fixed(row.otherFaceIou, 3)})`] : null,
  ]
  const frame = frameOf(entry)
  panels.forEach((p, i) => {
    if (!p) return
    paste(sheet, crop(p[0], frame, pw, ph), i * pw, top)
    rect(sheet, i * pw, top, 2, ph, [40, 40, 40])
    text(sheet, i * pw + 8, top + ph + 4, p[1], GREY)
  })
  return sheet
}

/** Writes report.md, results.csv, results.json and contact-sheet.png; the pair sheets are written as they're made. */
export function writeReport(outDir, rows, cells, { buildId, flagBelow, viewerCommit }) {
  mkdirSync(outDir, { recursive: true })
  const sorted = [...rows].sort((a, b) => a.score - b.score)
  const cols = ['picture', 'group', 'knife', 'finish', 'phase', 'seed', 'wear', 'side', 'face', 'arrangement', 'decidedBy', 'iou', 'score', 'otherFace', 'otherFaceScore', 'flagged', 'cause', 'details']
  const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const csv = [cols.join(','), ...sorted.map((r) => cols.map((c) => csvCell(c === 'details' ? details(r.result) : c === 'iou' || c === 'score' || c === 'otherFaceScore' ? fixed(r[c], 3) : r[c] ?? '')).join(','))]
  writeFileSync(path.join(outDir, 'results.csv'), csv.join('\n') + '\n')
  writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ buildId, viewerCommit, flagBelow, rows: sorted }, null, 2) + '\n')

  const flagged = sorted.filter((r) => r.flagged)
  const md = [
    '# Reference check',
    '',
    `Viewer build ${buildId}. ${rows.length - flagged.length} of ${rows.length} pairs pass; ${flagged.length} flagged (score below ${flagBelow}).`,
    '',
    'Scores are 0–1, on the painted parts only. Case Hardened: blue/gold placement (rank correlation of b*) and blue amount.',
    'Spray finishes: light/dark placement (rank correlation of L*) and contrast. Fades and Dopplers: hue placement and',
    'colour mix. "Face" is our side whose outline fits the reference without mirroring (the reference\'s side in our',
    'naming). "Arrangement" is what fits best: that side, or our other side mirrored (the same outline), chosen by the',
    'pattern; "Other" is the score of the one not chosen.',
    '',
    '| # | Group | Knife | Seed | Side | Face | Arrangement | Outline | Score | Other | Flag | Likely cause | Numbers |',
    '| ---: | --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |',
    ...sorted.map((r, i) => `| ${i + 1} | ${r.group} | ${r.knife} | ${r.seed} | ${r.side} | ${r.face} | ${r.arrangement}${r.decidedBy === 'pattern' ? ' *' : ''} | ${fixed(r.iou, 3)} | ${fixed(r.score)} | ${fixed(r.otherFaceScore)} | ${r.flagged ? '**flag**' : ''} | ${r.cause} | ${details(r.result)} |`),
    '',
    '`*`: a near-symmetric outline fits all four ways; the pattern chose among them.',
    '',
    'Sheets: `sheets/<picture>` for each flagged pair; `contact-sheet.png` for all.',
    '',
  ]
  writeFileSync(path.join(outDir, 'report.md'), md.join('\n'))

  const perRow = 10
  const ch = CELL.h * 2 + CELL.label
  const sheet = blank(perRow * (CELL.w + 4), Math.ceil(cells.length / perRow) * (ch + 4), [0, 0, 0, 255])
  cells.forEach((c, i) => paste(sheet, c, (i % perRow) * (CELL.w + 4), Math.floor(i / perRow) * (ch + 4)))
  writeFileSync(path.join(outDir, 'contact-sheet.png'), encodePng(sheet))
}

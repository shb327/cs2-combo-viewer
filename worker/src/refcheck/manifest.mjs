// The reference folder's manifest.csv: one row per picture (picture, group, knife, finish, phase, seed, wear, side, …).

/** One CSV line's fields (double quotes allowed). */
function fields(line) {
  const out = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out
}

/** The rows as objects keyed by the header line. */
export function readManifest(text) {
  const [head, ...lines] = text.split(/\r?\n/).filter((l) => l.trim())
  const keys = fields(head)
  for (const k of ['picture', 'group', 'knife', 'finish', 'seed', 'wear', 'side']) {
    if (!keys.includes(k)) throw new Error(`manifest.csv has no "${k}" column`)
  }
  return lines.map((line) => Object.fromEntries(fields(line).map((v, i) => [keys[i], v])))
}

/** A catalog name as the manifest writes it: "Gamma Doppler (Phase 3)" → gamma-doppler-phase-3, "Bowie Knife" → bowie. */
export const slug = (s) => s.toLowerCase().replace(/[()]/g, '').replace(/\s+knife$/, '').trim().replace(/\s+/g, '-')

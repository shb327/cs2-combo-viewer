// A claimed job: checked, and turned into the combo embed's parameters (docs/embed.md).

export const SHOT = { width: 1920, height: 1080, type: 'image/png' }

const ID = /^[A-Za-z0-9_-]{1,64}$/
const isIndex = (v) => Number.isInteger(v) && v >= 0 && v <= 65535

/**
 * The problem with a job, or null when it can be drawn: the fields the worker uses, and the image it asks for (the
 * embed's frame is fixed at 1920 by 1080).
 */
export function jobProblem(job) {
  if (!job || typeof job !== 'object') return 'the job is not an object'
  if (typeof job.job_id !== 'string' || !ID.test(job.job_id)) return 'job_id is missing or malformed'
  if (typeof job.combo_id !== 'string' || !ID.test(job.combo_id)) return 'combo_id is missing or malformed'
  const img = job.image
  if (!img || img.width !== SHOT.width || img.height !== SHOT.height || img.type !== SHOT.type) {
    return `the job asks for ${img?.width}x${img?.height} ${img?.type}; this worker makes ${SHOT.width}x${SHOT.height} ${SHOT.type}`
  }
  for (const key of ['glove', 'knife']) {
    const item = job[key]
    if (!item || !isIndex(item.def_index) || !isIndex(item.paint_index ?? 0)) return `${key}: def_index or paint_index missing`
    if (item.float !== null && !(typeof item.float === 'number' && item.float >= 0 && item.float <= 1)) return `${key}: bad float`
    if (item.seed !== null && !(Number.isInteger(item.seed) && item.seed >= 0 && item.seed <= 1000)) return `${key}: bad seed`
  }
  if (job.glove.float === null) return 'glove: float is null'
  if (!job.agent || !isIndex(job.agent.def_index)) return 'agent: def_index missing'
  return null
}

/**
 * The embed's combo for a job: indexes, the float, and the seed only when the job has one (null is the viewer's own
 * default). A vanilla knife has no float and no seed.
 */
export function comboFor(job) {
  const combo = {
    knife: job.knife.def_index, knife_paint: job.knife.paint_index ?? 0,
    gloves: job.glove.def_index, gloves_paint: job.glove.paint_index, gloves_float: job.glove.float,
    agent: job.agent.def_index,
  }
  if (job.knife.float !== null) combo.knife_float = job.knife.float
  if (job.knife.seed !== null) combo.knife_seed = job.knife.seed
  if (job.glove.seed !== null) combo.gloves_seed = job.glove.seed
  return combo
}

/** What the embed's error codes mean for the API: the failure reason, and whether one more try is worth it. */
export const EMBED_ERRORS = {
  'unknown-knife': { reason: 'asset_missing', retry: false },
  'unknown-knife-finish': { reason: 'asset_missing', retry: false },
  'unknown-gloves': { reason: 'asset_missing', retry: false },
  'unknown-gloves-finish': { reason: 'asset_missing', retry: false },
  'unknown-agent': { reason: 'asset_missing', retry: false },
  'assets-unavailable': { reason: 'asset_missing', retry: true },
  'context-lost': { reason: 'render_failed', retry: true },
  'bad-params': { reason: 'render_failed', retry: false },
}

// The test host's script: frames the combo embed, sends it commands and logs every message (window.hostLog, for the
// checks in C:\cs2-data\tools). Query: ?viewer=<origin> (default http://127.0.0.1:5321), ?ui=0, ?debug=0.
const query = new URLSearchParams(location.search)
const VIEWER = query.get('viewer') || 'http://127.0.0.1:5321'

/** Test combos, by the game's indexes as Combo Skin's catalog has them. */
const COMBOS = [
  { label: 'Reference: Karambit | Doppler (Ruby), Specialist Gloves | Crimson Kimono, Ricksaw',
    combo: { knife: 507, knife_paint: 415, knife_float: 0.01, knife_seed: 1, gloves: 5034, gloves_paint: 10033, gloves_float: 0.15, gloves_seed: 269, agent: '' } },
  { label: 'v2 glove: Specialist Gloves | Big Swell, Karambit | Doppler (Ruby)',
    combo: { knife: 507, knife_paint: 415, knife_float: 0.01, knife_seed: 1, gloves: 5034, gloves_paint: 1437, gloves_float: 0.07, gloves_seed: 1, agent: '' } },
  { label: 'Vanilla knife: Butterfly Knife, Specialist Gloves | Crimson Kimono',
    combo: { knife: 515, knife_paint: 0, knife_float: '', knife_seed: '', gloves: 5034, gloves_paint: 10033, gloves_float: 0.15, gloves_seed: 269, agent: '' } },
  { label: 'Another agent: Bloody Darryl The Strapped, Karambit | Doppler (Ruby), Crimson Kimono',
    combo: { knife: 507, knife_paint: 415, knife_float: 0.01, knife_seed: 1, gloves: 5034, gloves_paint: 10033, gloves_float: 0.15, gloves_seed: 269, agent: 4613 } },
]

const frame = document.getElementById('viewer')
const logEl = document.getElementById('log')
const t0 = performance.now()
window.hostLog = []
let seq = 0

function log(dir, data) {
  const entry = { t: Math.round(performance.now() - t0), dir, data }
  window.hostLog.push(entry)
  const text = JSON.stringify(data)
  logEl.textContent = `${String(entry.t).padStart(6)} ${dir} ${text.length > 240 ? text.slice(0, 240) + '…' : text}\n` + logEl.textContent
}

function send(message) {
  log('→', message)
  frame.contentWindow.postMessage(message, VIEWER)
}

/** The embed's URL for a combo (the first load, with no message needed). */
function embedUrl(combo, extra = {}) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(combo)) if (v !== '' && v !== null && v !== undefined) p.set(k, String(v))
  p.set('ui', query.get('ui') ?? '1')
  if (query.get('debug') !== '0') p.set('debug', '1')
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return `${VIEWER}/combo?${p}`
}

window.addEventListener('message', (e) => {
  if (e.origin !== VIEWER || e.source !== frame.contentWindow) return
  log('←', e.data)
})

/** Loads combo i without reloading the iframe; returns the command's id. */
window.loadCombo = (i, view) => {
  const id = `c${++seq}`
  send({ type: 'cs3d:load', id, combo: COMBOS[i].combo, ...(view && { view }) })
  return id
}
window.command = (message) => send(message)
window.COMBOS = COMBOS

const combos = document.getElementById('combos')
COMBOS.forEach((c, i) => {
  const b = document.createElement('button')
  b.textContent = c.label
  b.onclick = () => window.loadCombo(i)
  combos.append(b)
})

const actions = {
  inspect: () => send({ type: 'cs3d:inspect', id: `i${++seq}` }),
  fp: () => send({ type: 'cs3d:setView', id: `v${++seq}`, view: 'fp' }),
  orbit: () => send({ type: 'cs3d:setView', id: `v${++seq}`, view: 'orbit' }),
  state: () => send({ type: 'cs3d:getState', id: `s${++seq}` }),
  bad: () => send({ type: 'cs3d:load', id: `b${++seq}`, combo: { ...COMBOS[0].combo, knife: 9999 } }),
  lose: () => send({ type: 'cs3d:loseContext', id: `l${++seq}` }),
  reload: () => { frame.src = embedUrl(COMBOS[0].combo) },
}
for (const b of document.querySelectorAll('[data-cmd]')) b.onclick = () => actions[b.dataset.cmd]()

document.getElementById('origin').textContent = `This page: ${location.origin}. Viewer: ${VIEWER}.`
const first = Number(query.get('combo') ?? 0)
if (query.get('start') !== 'message') frame.src = embedUrl(COMBOS[first].combo)
else {
  // No combo in the URL: the embed waits; the page sends it (and starts the handshake) once the frame has loaded.
  frame.src = `${VIEWER}/combo?ui=1${query.get('debug') !== '0' ? '&debug=1' : ''}`
  frame.addEventListener('load', () => window.loadCombo(first), { once: true })
}

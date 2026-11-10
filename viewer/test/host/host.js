// The test host's script: frames the combo embed, sends it commands and logs every message (window.hostLog, for the
// checks in C:\cs2-data\tools). Query: ?viewer=<origin> (default http://127.0.0.1:5321), ?ui=0, ?debug=0,
// ?input=game, ?combo=<index>, ?start=message.
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
const mapSelect = document.getElementById('map')
const agentSelect = document.getElementById('agent')
const inputBox = document.getElementById('input-game')
/** The combo last sent (its index in COMBOS), and the map and agent chosen. */
let comboIndex = Number(query.get('combo') ?? 0)
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

const cover = document.getElementById('cover')
const placeholder = document.getElementById('placeholder')

function send(message) {
  if (message.type === 'cs3d:load' && cover.checked) placeholder.hidden = false
  log('→', message)
  frame.contentWindow.postMessage(message, VIEWER)
}

/** The embed's URL for a combo (the first load, with no message needed). */
function embedUrl(combo, extra = {}) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(combo)) if (v !== '' && v !== null && v !== undefined) p.set(k, String(v))
  p.set('ui', query.get('ui') ?? '1')
  if (query.get('debug') !== '0') p.set('debug', '1')
  if (inputBox.checked) p.set('input', 'game')
  if (mapSelect.value) p.set('map', mapSelect.value)
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return `${VIEWER}/combo?${p}`
}

window.addEventListener('message', (e) => {
  if (e.origin !== VIEWER || e.source !== frame.contentWindow) return
  log('←', e.data)
  if (e.data?.type === 'cs3d:ready') fillLists(e.data)
  // A page that swaps its screenshot for the view on cs3d:loaded: the view must already show the combo.
  if (e.data?.type === 'cs3d:loaded' || e.data?.type === 'cs3d:error') placeholder.hidden = true
  if (e.data?.type === 'cs3d:key') flash(`Escape forwarded by the embed (${new Date().toLocaleTimeString()})`)
})

/** Version 2: the maps and agents the embed offers, from cs3d:ready. */
function fillLists(ready) {
  document.getElementById('version').textContent = `Protocol ${ready.version}; features: ${(ready.features ?? []).join(', ') || 'none'}`
  const keepMap = mapSelect.value
  mapSelect.replaceChildren(new Option('(default)', ''), ...(ready.maps ?? []).map((m) => new Option(`${m.name} (${m.id})${m.id === ready.defaultMap ? ', default' : ''}`, m.id)))
  mapSelect.value = keepMap
  const keepAgent = agentSelect.value
  agentSelect.replaceChildren(new Option('(default)', ''), ...(ready.agents ?? []).map((a) => new Option(`${a}${a === ready.defaultAgent ? ', default' : ''}`, String(a))))
  agentSelect.value = keepAgent
}

function flash(text) {
  const el = document.getElementById('flash')
  el.textContent = text
}

/** The combo to send: the one chosen, with the agent picked (if any). */
function currentCombo(i = comboIndex) {
  const combo = { ...COMBOS[i].combo }
  if (agentSelect.value) combo.agent = Number(agentSelect.value)
  return combo
}

/** Loads combo i without reloading the iframe; returns the command's id. */
window.loadCombo = (i, view, extra = {}) => {
  comboIndex = i
  const id = `c${++seq}`
  send({ type: 'cs3d:load', id, combo: currentCombo(i), ...(view && { view }), ...(mapSelect.value && { map: mapSelect.value }), ...extra })
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
  light: () => send({ type: 'cs3d:attack', id: `a${++seq}`, attack: 'light' }),
  heavy: () => send({ type: 'cs3d:attack', id: `a${++seq}`, attack: 'heavy' }),
  badAttack: () => send({ type: 'cs3d:attack', id: `a${++seq}`, attack: 'kick' }),
  apply: () => window.loadCombo(comboIndex),
  badMap: () => window.loadCombo(comboIndex, undefined, { map: 'de_nowhere' }),
  badAgent: () => send({ type: 'cs3d:load', id: `c${++seq}`, combo: { ...currentCombo(), agent: 1 }, ...(mapSelect.value && { map: mapSelect.value }) }),
  lose: () => send({ type: 'cs3d:loseContext', id: `l${++seq}` }),
  reload: () => {
    if (cover.checked) placeholder.hidden = false
    frame.src = embedUrl(currentCombo())
  },
}
for (const b of document.querySelectorAll('[data-cmd]')) b.onclick = () => actions[b.dataset.cmd]()

document.getElementById('origin').textContent = `This page: ${location.origin}. Viewer: ${VIEWER}.`
inputBox.checked = query.get('input') === 'game'
inputBox.onchange = () => actions.reload()
mapSelect.onchange = () => actions.apply()
agentSelect.onchange = () => actions.apply()
const first = comboIndex
if (query.get('start') !== 'message') frame.src = embedUrl(COMBOS[first].combo)
else {
  // No combo in the URL: the embed waits; the page sends it (and starts the handshake) once the frame has loaded.
  frame.src = `${VIEWER}/combo?ui=1${query.get('debug') !== '0' ? '&debug=1' : ''}`
  frame.addEventListener('load', () => window.loadCombo(first), { once: true })
}

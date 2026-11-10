# The combo embed

The contract between the viewer and the pages that show it: Combo Skin's "View in 3D" button, the admin dashboard and
the screenshot worker. The viewer draws one combo (a knife in gloves, on an agent's arms) in first person, in an
iframe, and is driven by its URL and by `postMessage`.

- Address: **`https://view.combo.skin/combo?…`** (locally `http://127.0.0.1:5321/combo?…`, the production build on
  `vite preview`).
- Items by the game's indexes, as Combo Skin's catalog has them. The embed draws exactly the float and seed it is given.
- Protocol version 2 (`cs3d:ready` says which, and which features beyond version 1 work: see "Version 2"). A page
  that uses none of version 2's parameters and commands gets exactly version 1's behaviour; version 2 only adds fields
  to events.

## Parameters

| Parameter | Value | Required |
| --- | --- | --- |
| `knife` | The knife's item definition index (Karambit `507`, Butterfly Knife `515`) | yes |
| `knife_paint` | The finish's paint index (Doppler (Ruby) `415`); `0` or left out: vanilla | no |
| `knife_float` | The exact float, 0 to 1, inside the finish's range | yes, except vanilla |
| `knife_seed` | The pattern seed, a whole number from 0 to 1000; left out: the default seed, `0` | no |
| `gloves` | The gloves' item definition index (Specialist Gloves `5034`) | yes |
| `gloves_paint` | The finish's paint index (Crimson Kimono `10033`, Big Swell `1437`) | yes |
| `gloves_float` | The exact float, inside the finish's range | yes |
| `gloves_seed` | The pattern seed, 0 to 1000; left out: the default seed, `0` | no |
| `agent` | The agent's item definition index (Bloody Darryl The Strapped `4613`); empty or left out: Lt. Commander Ricksaw \| NSWC SEAL (`5404`) | no |
| `view` | `fp` (first person, the default) or `orbit` (the knife alone, turned with the mouse) | no |
| `map` | Version 2: one of `cs3d:ready`'s `maps` (`de_vertigo`); left out: the default map (`defaultMap`, Vertigo). Anything else is `unknown-map` | no |
| `input` | Version 2: `game`: the game's mouse buttons and keys in first person, and the mouse never moves the view (see "Input mode"). Left out: input as in version 1 | no |
| `ui` | `1` (default): a loading pill and error messages over the view; `0`: only the view and the thin progress bar | no |
| `capture` | `1`: the screenshot mode (below, "Capturing"): a fixed 1920×1080 frame, `ui=0`, the pose held still, `cs3d:captureReady` and `cs3d:capture` | no |
| `debug` | `1`: accepts `cs3d:loseContext` (testing) | no |

**Seeds left out.** A combo without seeds (Combo Skin sends none when a combo has no seed conditions) is drawn with
seed `0` for each item left out, by the embed itself; `cs3d:loaded` echoes the seed drawn. Combo Skin's screenshot and
its "View in 3D" send the same combo, so both draw the same pattern.

A float a hair outside the finish's range (up to 0.0001, from rounding) is drawn at the range's end; further out is an
error. Doppler and Gamma Doppler phases have their own paint indexes, as in the catalog. Every built item can be shown
(576 knife finishes, 94 glove finishes, 63 agents, as of release `3de0d6e58111`).

Example, the reference combo:

```
https://view.combo.skin/combo?knife=507&knife_paint=415&knife_float=0.01&knife_seed=1&gloves=5034&gloves_paint=10033&gloves_float=0.15&gloves_seed=269
```

Without a combo in the URL the embed shows the background and waits for `cs3d:load`.

**Unknown parameters are ignored**, in every version: a page may send `input=game` or `map=…` to an older embed, which
draws the combo as before.

## Messages

Every message is an object with a `type` starting `cs3d:`. A command may carry an `id` (a string); every event it
causes carries the same `id`, so a page can drop events from a combo it has already switched away from. Events caused
by the URL have `id: null`.

### From the embed

| Event | Fields | When |
| --- | --- | --- |
| `cs3d:ready` | `version` (2), `release` (the asset release, or null), `webgl2` (boolean); version 2: `features`, `maps`, `defaultMap`, `agents`, `defaultAgent` (see "Version 2") | Once, first, as soon as the embed knows the parent's origin (below) and has its lists of maps and agents |
| `cs3d:progress` | `id`, `loaded`, `total` (files finished and started so far) | While loading, at most 10 a second; `total` grows as files are found |
| `cs3d:loaded` | `id`, `combo` (the combo drawn: every field as a number, the default agent's index filled in), `view`, `map` (version 2), `release`, `ms` (from the request, or from the page's start for the URL's combo) | The combo is drawn, and a frame showing it has been presented (version 2, `first-frame`) |
| `cs3d:error` | `id`, `code`, `message` (a sentence to show), `retryable`, `kept` (version 2: the last drawn combo is still on screen) | The combo can't be drawn, or a command was refused (codes below) |
| `cs3d:recovering` | `id`, `reason` (`context-lost`), `attempt` (1) | The GPU dropped the view; the embed rebuilds it and loads the combo again (`progress`, then `loaded` follow) |
| `cs3d:state` | `id`, `status` (`loading`, `loaded`, `error`), `combo`, `view`, `map` (version 2), `release`, `loadId` (the `id` of the request shown) | Reply to `cs3d:getState` |
| `cs3d:key` | `id` (null), `key` (`Escape`) | Version 2, with `input=game`: Escape was pressed in the embed (see "Input mode") |
| `cs3d:captureReady` | `id`, `combo`, `release` | With `capture=1`: after `cs3d:loaded`, once the frame is final (see "Capturing") |
| `cs3d:captured` | `id`, `png` (a `Blob`, `image/png`), `width`, `height` (1920, 1080), `coverage` (0 to 1: the share of the frame the 3D view drew), `combo`, `release` | Reply to `cs3d:capture` |

The order for one request is always `progress`… then `loaded` or `error`, with `recovering` and more `progress` in
between after a lost GPU context. A newer request supersedes an older one: the older one gets no further events.

### To the embed

| Command | Fields | Does |
| --- | --- | --- |
| `cs3d:load` | `id`, `combo` (the parameters above as an object, numbers or strings), `view` (optional), `map` (version 2, optional: left out, the default map) | Shows another combo in the same iframe, without a reload. While it loads, the last frame stays on screen |
| `cs3d:inspect` | `id` | Plays the knife's inspect from the start (first person) |
| `cs3d:setView` | `id`, `view` (`fp` or `orbit`) | Changes the view, reloading the combo in it |
| `cs3d:getState` | `id` | Asks for `cs3d:state` |
| `cs3d:capture` | `id` | With `capture=1` and a combo loaded: asks for `cs3d:captured`. Otherwise `cs3d:error` `bad-params` (the combo shown stays) |
| `cs3d:loseContext` | `id` | Testing only, with `debug=1`: loses the WebGL context as a GPU reset would |

Commands sent before `cs3d:ready` aren't lost: the embed keeps them from its first script on and handles them in order.

### Errors

| `code` | Meaning | `retryable` | What the page should do |
| --- | --- | --- | --- |
| `no-webgl2` | The browser has no WebGL2: 3D can't run | no | Show the screenshot and hide the button (see "Before showing the button") |
| `bad-params` | A field is missing, not a number, out of range, or a float outside the finish's range | no | A bug on the page's side: show the screenshot |
| `unknown-knife` / `unknown-gloves` | No such knife or gloves (or the index is another kind of item) | no | Show the screenshot |
| `unknown-knife-finish` / `unknown-gloves-finish` | The item has no finish with that paint index | no | Show the screenshot |
| `unknown-agent` | No built agent with that index | no | Retry without `agent` (Ricksaw), or show the screenshot |
| `unknown-map` | Version 2: a `map` that isn't in `cs3d:ready`'s `maps` (the studio never is) | no | Retry without `map` (the default) |
| `assets-unavailable` | The catalog or a file couldn't be loaded (network, host) | yes | Offer "Try again" (send `cs3d:load` again), else the screenshot |
| `context-lost` | The GPU dropped the view twice in a row while loading (a reset, often during a long first shader compile on a weak GPU) | yes | Show the screenshot; "Try again" may work once the GPU has settled |

`assets-unavailable` also covers a map whose files couldn't be loaded: the embed never falls back to another map or
the studio.

**`kept`** (version 2): `true` when the last drawn combo is still on screen after the error, so the page can leave
the view up and just say what failed: a `cs3d:load` with the same knife and gloves (same finishes, floats and seeds)
and the same view whose agent or map was refused or failed to load; a refused `cs3d:capture`. `false` otherwise: the
view is cleared (as in version 1) or there was nothing on screen.

The `message` is plain English for people, e.g. "Unknown knife (item 9999)." or "knife_float 0.5 is outside Karambit |
Doppler (Ruby)'s range (0 to 0.08).". With `ui=1` the embed shows it too.

## Version 2

`cs3d:ready` says what the embed can do:

```js
{ type: 'cs3d:ready', version: 2, release: '3de0d6e58111', webgl2: true,
  features: ['map', 'agents', 'input', 'keys', 'first-frame'],
  maps: [{ id: 'de_vertigo', name: 'Vertigo' }], defaultMap: 'de_vertigo',
  agents: [4613, 4619, /* … */ 5404 /* … */], defaultAgent: 5404 }
```

- **`features`**: each is listed only once it works. `map`: the `map` parameter and field. `agents`: the `agents`
  list (and changing the agent of the combo shown, below). `input`: `input=game`. `keys`: `cs3d:key`.
  `first-frame`: `cs3d:loaded` comes after a frame of the combo is on screen.
- **`maps`**: the maps a visitor may choose, in the order to show, each `{ id, name }`: the id is `[a-z0-9_]`, at most
  32 characters; the name plain English, at most 40. Never the studio. `defaultMap` is one of them (Vertigo).
- **`agents`**: the item definition indexes of every built agent (63 as of release `3de0d6e58111`); `defaultAgent`
  is Ricksaw's, `5404`. The site has the agents' names in its own catalog.
- If the lists can't be loaded, `cs3d:ready` comes with empty `maps` and `agents`, and the load's `cs3d:error`
  (`assets-unavailable`) follows.

### Map and agent

The map is chosen like the view: `map` in the URL or in `cs3d:load`. Left out, the default is drawn (a `cs3d:load`
without `map` goes back to Vertigo; it doesn't keep the map before). `cs3d:loaded` and `cs3d:state` say which map is
drawn. Every device draws the chosen map, phones included (in version 1 phones got the studio).

A `cs3d:load` with the **same combo and another agent or map** changes only the arms or the scene: the last frame
(the map's background included) stays on screen until the new one is drawn, then `cs3d:loaded`. If it fails, the
last drawn scene stays and the error says `kept: true`:

```js
send({ type: 'cs3d:load', id: 'a2', combo: { ...combo, agent: 4613 } })  // → progress…, loaded { combo: { agent: 4613, … }, map: 'de_vertigo' }
send({ type: 'cs3d:load', id: 'm1', combo, map: 'de_dust2' })             // not built: → error { code: 'unknown-map', kept: true }
send({ type: 'cs3d:load', id: 'a3', combo: { ...combo, agent: 4619 } })  // its files fail: → error { code: 'assets-unavailable', kept: true, retryable: true }
```

### Input mode

With `input=game` in the URL, in first person:

- A **left click** on the view plays the light swing, a **right click** the heavy swing (no context menu), **F** the
  inspect, each from its start, cutting what plays. A swing the knife has no animation for does nothing. Holding F
  doesn't repeat it.
- Only the mouse: **touch and pen do nothing**.
- The mouse never turns or zooms the view (in the orbit view either), and the pointer is never locked.
- A click gives the embed's document the keyboard's focus, so F works after it.
- **Escape** isn't acted on in the embed: it posts `cs3d:key { id: null, key: 'Escape' }` to the parent (to its
  origin only, as every event), so the page can close its window. No other key is forwarded.

Without `input`, input is as in version 1: clicks and keys do nothing, and the orbit view turns with the mouse.

### First frame

`cs3d:loaded` is posted only once a frame showing the combo has been presented: two drawn frames after the combo is
in place, in every mode (`capture=1` too, where `cs3d:captureReady` still follows). A page that swaps its screenshot
for the iframe on `cs3d:loaded` never shows an empty view. While the iframe is off screen it doesn't draw, so
`cs3d:loaded` waits until it is shown.

### Example: a window with the game's actions

```js
const VIEWER = 'https://view.combo.skin'
let ready = null
const frame = document.createElement('iframe')
frame.src = `${VIEWER}/combo?${new URLSearchParams({ ...combo, input: 'game', ui: '0' })}`
window.addEventListener('message', (e) => {
  if (e.origin !== VIEWER || e.source !== frame.contentWindow) return
  const m = e.data
  if (m.type === 'cs3d:ready') ready = m                        // m.version >= 2: offer m.maps and m.agents
  if (m.type === 'cs3d:loaded') hideScreenshot()                 // a frame of the combo is on screen
  if (m.type === 'cs3d:key' && m.key === 'Escape') closeWindow()
  if (m.type === 'cs3d:error' && !m.kept) showScreenshot(m.message)
})
const choose = (map, agent) =>
  frame.contentWindow.postMessage({ type: 'cs3d:load', id: crypto.randomUUID(), combo: { ...combo, agent }, map }, VIEWER)
```

Check `ready.version >= 2` and `ready.features` before offering a choice: an older embed ignores `map`, `input` and
the commands it doesn't know.

## Capturing

For Combo Skin's screenshots (the worker in [`worker/`](../worker/README.md)). With `capture=1`:

- **A fixed frame**: the view is 1920×1080 CSS pixels whatever the window's size, drawn at pixel ratio 1, without the
  adaptive resolution; antialiasing and the map's post-processing as on the site. `ui=0` is implied. A browser window
  of 1920×1080 at device scale 1 shows it whole.
- **A still pose**: the hands' sway is off and the knife's idle is held at its start (time 0) on every frame, so every
  frame of a loaded combo is the same, and two shots of the same combo are identical.
- **`cs3d:captureReady`**: posted after `cs3d:loaded` once every file has loaded, the map's background is decoded and in
  the page, and two frames have been drawn with that still true (the glove composites and the texture uploads happen in
  the first). Wait for it before capturing.
- **`cs3d:capture`**: the reply `cs3d:captured` holds the frame as the page shows it: the map's background (drawn as CSS
  draws it, `object-fit: cover`) with the 3D view over it, encoded as PNG. The 3D view is drawn and read in the same
  task, so its drawing buffer can't have been cleared: a shot is never blank. `coverage` says how much of the frame the
  3D view drew (about 0.2 for a combo in first person; 0 would mean an empty view). The background is fetched with CORS
  in this mode (the asset host allows the viewer's origins), so the frame can be read back.
- Use the `id` of the `cs3d:load` for the capture too, and check `release` (the asset release drawn).

**Not framed.** The worker opens `/combo?capture=1` itself, in its own browser, without a parent page. Such a page
can't post to a parent: it dispatches each of its messages on its own window as a `cs3d` DOM event (`event.detail` is
the message), and takes commands posted to itself (`window.postMessage(command, location.origin)`, from an origin on
the list below). The reply to `cs3d:capture` is named `cs3d:captured` so it can't be mistaken for the command.

```js
// In the page (the worker injects this before the page's scripts run).
addEventListener('cs3d', (e) => console.log(e.detail.type))
window.postMessage({ type: 'cs3d:load', id: 'job1', combo: { knife: 507, knife_paint: 415, knife_float: 0.01, gloves: 5034, gloves_paint: 10033, gloves_float: 0.15 } }, location.origin)
// … cs3d:loaded, cs3d:captureReady { id: 'job1' } …
window.postMessage({ type: 'cs3d:capture', id: 'job1' }, location.origin)
// … cs3d:captured { id: 'job1', png: Blob, width: 1920, height: 1080, coverage: 0.22 }
```

## Origins

The embed accepts messages only from these origins, and only from its parent window; anything else is ignored without
a reply. It posts only to its parent's origin, never to `'*'`.

- `https://combo.skin`, `https://view.combo.skin`, `https://admin.combo.skin`
- `http://localhost:<port>` and `http://127.0.0.1:<port>` for ports 5173 and 4173 (Combo Skin's site, dev and
  preview), 5174 (its admin dashboard), 5320 and 5321 (this viewer, dev and preview) and 5322 (the test page)

`www.combo.skin` redirects to `https://combo.skin`, so it isn't listed. The list is in
[`viewer/src/lib/embed/origins.ts`](../viewer/src/lib/embed/origins.ts).

**How the embed learns its parent's origin**: `location.ancestorOrigins` (Chrome, Safari, and Firefox as of 159, the version tested),
else `document.referrer`, else the first message from an allowed origin. So:

- A host page **shouldn't use `Referrer-Policy: no-referrer`** (or `referrerpolicy="no-referrer"` on the iframe):
  older browsers without `ancestorOrigins` then can't tell the parent until it speaks. The default
  (`strict-origin-when-cross-origin`) is right.
- A page can always start the handshake itself: send any command (`cs3d:getState` will do) and `cs3d:ready` follows.

## Framing and headers

The hosted viewer sends (`viewer/public/_headers`, Cloudflare Pages' format; `vite preview` sends the same):

- `Content-Security-Policy: frame-ancestors 'self' https://combo.skin https://admin.combo.skin http://localhost:*
  http://127.0.0.1:*`: other sites can't put the viewer in their pages. The same policy limits what the viewer itself
  loads: scripts from its own origin only (`'wasm-unsafe-eval'` for three.js' mesh decoder, no `eval`), data from
  itself and `https://assets.combo.skin`, no plugins, no forms.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that
  turns off camera, microphone, location, USB and payment.
- `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` (the build's hashed scripts and styles).
- `X-Robots-Tag: noindex` on the `*.pages.dev` address only (a host rule in `_headers`), so search engines index
  `view.combo.skin` and not the Pages address.

The assets themselves come from `https://assets.combo.skin`, whose CORS rules allow `https://view.combo.skin` (phase 3B).

## Behaviour

- **First frame**: the page's colour and a loading bar appear before any script runs; the map's background as soon as
  the 3D code has loaded (about a second on a cold cache), then the progress bar until the combo is drawn.
- **No WebGL2**: checked before the 3D code is fetched; `cs3d:ready` says `webgl2: false` and `cs3d:error`
  `no-webgl2` follows at once.
- **Lost WebGL context** (a GPU reset or driver crash, Chrome dropping the oldest of too many contexts): the embed
  throws the view away, releases its context, makes a new one and loads the same combo again (`cs3d:recovering`,
  then `progress` and `loaded`). If it is lost again before the combo has loaded, it stops and posts `cs3d:error`
  `context-lost` (retryable). A loss after the combo has loaded is always rebuilt. The page can retry with `cs3d:load`.
- **Switching combos**: one WebGL context for the iframe's whole life (more only after a loss, the old one released);
  each combo's GPU memory is freed when the next is drawn. Files shared between combos (the weapon grunge and wear, a
  glove model's textiles, an agent's arms) come from the browser's cache.
- **Offscreen**: the embed stops drawing while the iframe is scrolled out of view.
- **Narrow views**: in first person the camera keeps 16:9's horizontal angle on views narrower than 16:9 (a phone held
  upright): the hands and knife keep their size across the view's width and more shows above and below them. Wider
  views keep the vertical angle. The map's background covers the view (`object-fit: cover`), so on a tall view it is
  cropped at the sides.

## Example

```js
const VIEWER = 'https://view.combo.skin'

/** Opens the 3D view of a combo inside `container`; `onFail` shows the screenshot instead. */
function openCombo(container, combo, onFail) {
  const frame = document.createElement('iframe')
  frame.src = `${VIEWER}/combo?${new URLSearchParams(combo)}`
  frame.title = 'Combo in 3D'
  frame.allow = 'fullscreen'
  frame.style.cssText = 'width: 100%; height: 100%; border: 0'
  const onMessage = (e) => {
    if (e.origin !== VIEWER || e.source !== frame.contentWindow) return
    const m = e.data
    if (m.type === 'cs3d:loaded') countOpen(m.combo, m.ms) // the site's own 3D-open count
    if (m.type === 'cs3d:error') onFail(m)                  // m.code, m.message, m.retryable
  }
  window.addEventListener('message', onMessage)
  container.replaceChildren(frame)
  return {
    // Another combo in the same iframe: no reload, the shared files are cached.
    show: (next, id = crypto.randomUUID()) => frame.contentWindow.postMessage({ type: 'cs3d:load', id, combo: next }, VIEWER),
    inspect: () => frame.contentWindow.postMessage({ type: 'cs3d:inspect' }, VIEWER),
    close: () => { window.removeEventListener('message', onMessage); frame.remove() },
  }
}

openCombo(document.querySelector('#viewer'), {
  knife: 507, knife_paint: 415, knife_float: 0.0123, knife_seed: 412,
  gloves: 5034, gloves_paint: 10033, gloves_float: 0.2511, gloves_seed: 269,
  agent: '', // Ricksaw
}, (error) => showScreenshot(error.message))
```

### Before showing the button

The embed reports `no-webgl2` at once, but a page can skip the iframe on such browsers and only offer the screenshot:

```js
const has3d = (() => { try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false } })()
```

(Drop that canvas afterwards; it holds a context until it is collected.) Load 3D only on a click: a first combo
downloads about 33 MB.

## Load times

The reference combo, cold (a new browser profile, no cache), assets from R2, measured on 2026-11-08 through the test
host (details in the roadmap, phase 4):

| Conditions | `cs3d:ready` | `cs3d:loaded` | Downloaded |
| --- | ---: | ---: | ---: |
| A fast PC and connection | 0.2 s | 3.0 s | 33.8 MB |
| CPU 4× slower and 10 Mbit/s | 0.6 s | 30.5 s | 33.8 MB |

A second combo in the same iframe takes 0.6 to 1.4 s (shared files cached); a newer (v2) glove's first load several
seconds more, for its shader compile. Show progress from `cs3d:progress`, and keep the screenshot until `cs3d:loaded`.

## Testing

`viewer/test/host/` is a stand-in for a combo page: plain HTML served by `node viewer/test/host/serve.mjs` on
`http://127.0.0.1:5322` (an allowed origin) and `http://127.0.0.1:5323` (not allowed). It frames the viewer
(`?viewer=<origin>`, default `http://127.0.0.1:5321`), switches between four combos (the reference, Big Swell, a vanilla
Butterfly Knife, Bloody Darryl The Strapped), sends every command and logs every message (`window.hostLog`).
`?noref=1` sends `Referrer-Policy: no-referrer`; `?start=message` sends the combo by message instead of the URL.

Version 2 in the test host: the protocol version and features from `cs3d:ready`; a map and an agent list filled from
it (a choice loads the combo again by message with it); an unknown map and an unknown agent (both `kept`); the swings
(`cs3d:attack`); `input=game` (`?input=game` or a checkbox, which reloads the iframe; Escape in the view shows a line
when `cs3d:key` arrives); and a placeholder over the view from each load until `cs3d:loaded`, as a page that swaps its
screenshot would.

```powershell
cd viewer
$env:VITE_ASSET_BASE='https://assets.combo.skin'; npm.cmd run build
npm.cmd run preview              # 5321
node test/host/serve.mjs         # 5322 and 5323; open http://127.0.0.1:5322/
```

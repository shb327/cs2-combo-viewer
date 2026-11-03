<p align="center">
  <img src="public/logo/web-app-manifest-192x192.png" alt="ChainSkins" width="96" height="96">
</p>

<h1 align="center">ChainSkins 3D Viewer</h1>

<p align="center">
  <a href="https://3d.chainskins.net"><b>Open the app →</b></a>
  &nbsp;·&nbsp;
  <a href="https://3d.chainskins.net/api">Embed API</a>
</p>

A browser 3D viewer for CS2 skins, built on **the game's own shaders** ported to WebGL. It covers:

- float and pattern (seed);
- stickers, charms, collectible pins, agent patches, gloves, agents and pets (the egg, the chick and the three hens, with every colour and animation);
- first person, with the game's inspect animation and its attack animations (shots, a knife's slashes, stabs and backstabs);
- the game's inspect maps as backgrounds.

> Not affiliated with or endorsed by Valve Corporation. Counter-Strike and CS2 are trademarks of Valve Corporation. The game's models, textures, maps and the shaders this viewer ports belong to Valve; the game assets are not in this repository. Only the viewer's own code is under the repository's license.

The Fade percentages follow [chescos' calculator](https://github.com/chescos/csgo-fade-percentage-calculator) (MIT; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

React 19 · TypeScript · Vite · Tailwind v4 · shadcn/ui · React Router · three.js.

```bash
npm install
npm run dev        # http://localhost:5320 (assets from public/assets)
npm run build      # dist/ (assets from VITE_ASSET_BASE: the R2 bucket)
npm run preview    # http://localhost:5321, serves dist/
```

## Contents

- [Routes](#routes)
- [Layout](#layout)
  - [The viewer (`src/lib/viewer/`)](#the-viewer-srclibviewer)
- [Shaders](#shaders)
  - [Where the data is in the game files](#where-the-data-is-in-the-game-files)
  - [The pieces (`src/lib/materials/`)](#the-pieces-srclibmaterials)
  - [Details that matter](#details-that-matter)
- [Assets](#assets)
- [Public API (embed)](#public-api-embed)
  - [Quick start: loading items with `postMessage`](#quick-start-loading-items-with-postmessage)
  - [URL parameters](#url-parameters)
  - [Messages to the embed](#messages-to-the-embed)
  - [Messages from the embed](#messages-from-the-embed)
- [Improvements](#improvements)
- [Known issues](#known-issues)

## Routes

| Route | Shows |
| --- | --- |
| `/skin/:item/:kit` | A weapon or a pair of gloves with its skin |
| `/sticker/:id` | A sticker on its own. `?swear=<0-1>` sets its wear and `?card=1` puts it on the game's inspect card (the grey card with the CS2 mark) |
| `/charm/:id` | A charm on its own |
| `/agent/:id` | An agent holding the loadout's weapon, wearing its gloves and its patches (`ap`) |
| `/pin/:id` | A collectible pin on its own (`id` = its item definition index, db.json's `pins` key) |
| `/patch/:id` | An agent patch on its own, on the game's inspect card (`id` = its patch kit id, db.json's `patches` key) |
| `/pet/:id` | A pet on its own (`id` = its pet definition: `1` egg, `2` chick, `3` catalana, `4` silkie, `5` polish). The colour is `?pv=<n>` (0 = the first) and the animation `?pc=<clip>` (`chick_trick05`); the sidebar lists both |
| `/share/:code` | A shared link |
| `/inspect/*` | An inspect link opened by URL: `/inspect/steam://rungame/730/…+csgo_econ_action_preview%20<hex>`, `/inspect/steam://run/730//+csgo_econ_action_preview%20<hex>`, `/inspect/<hex>`, or `/inspect/<hex>` of the raw protobuf (no key byte, no checksum). Decodes it and redirects to the skin, sticker, charm or agent it names (an agent's patches go in `ap`) |
| `/embed` | The viewer alone, to put in an iframe (see [Public API](#public-api-embed)) |
| `/api` | The embed API's docs, with a live playground: [3d.chainskins.net/api](https://3d.chainskins.net/api) |

All the state lives in the URL, so every view is a shareable link. The search params are:

| Param | Meaning |
| --- | --- |
| `float`, `seed` | The skin's float and pattern |
| `fp` | First person |
| `fpg` | The gloves worn in first person |
| `fpa` | The agent whose arms first person shows |
| `st` | The stickers: `id~slot~wear~x~y~rotation~scale`, comma-separated |
| `charm`, `cseed`, `cx`, `cz`, `cpx`, `cpy`, `cpz` | The charm, its pattern and its placement |
| `cst` | The sticker on the charm's slab |
| `swear` | A standalone sticker's wear |
| `ap` | An agent's patches, one entry per slot (3), comma-separated: `id~size`, an empty entry is an empty slot (`ap=4588~1.15,,4584~0.99`) |

The **loadout** is kept in `localStorage` (`loadout-v1`). It holds the gloves, the agent, and the weapon an agent holds (with its seed and float). First person and the agent page share it. A link's own `fpg` / `fpa` win over it.

## Layout

```
src/
  pages/        viewer-page.tsx (wires hooks and components), share-page.tsx, inspect-page.tsx, embed-page.tsx (wires the embed hooks), home-page.tsx
  routes.tsx
  hooks/        use-viewer (creates the SkinViewer), use-viewer-state (URL state), use-live-search-params,
                use-loadout, use-skin-loader, use-viewer-sync, use-picker, use-inspect-link, use-inspect-actions,
                use-loadout-sync, use-catalog, use-lighting, use-viewmodel, use-key-shortcut,
                use-embed-* (the embed: options, target, commands, status events, frozen frame, viewer setup)
  components/   sidebar/, stage/, picker/, inspect/, embed/, home/, common/, ui/ (shadcn)
  context/      db-context.tsx (db.json: market names, images, rarities)
  lib/
    data/       catalog, items, stickers / charms, agents, pins, patches, pets, inspect links, Source RNG
    embed/      the embed's protocol: types, URL params, target resolving, messaging, state reply
    materials/  the ported shaders (see below)
    viewer/     the three.js viewer
```

### The viewer (`src/lib/viewer/`)

`SkinViewer` (`skin-viewer.ts`) is the facade React talks to. Its methods include `load`, `loadFirstPerson`, `showAgent`, `showSticker`, `showCharm`, `showPin`, `showPatch`, `showPet`, `setPetVariant`, `playPetClip`, `setAgentPatches`, `setFloat`, `setSeed`, `setStickers`, `setCharm`, `setLighting`, `setViewmodel`, `inspect`, `inspectGloves`, `lookAtGloves` and `screenshot`. It is built from these modules:

| Module | Does |
| --- | --- |
| `model-loader.ts` | Loads weapons, gloves and agents' arms with their materials and finishes |
| `weapon-attachments.ts` | The weapon's stickers and charm (sticker mask, keychain anchors) |
| `map-stage.ts` | The studio or an inspect map: HDR panorama (reflections), the pre-rendered background video, the map's lights, post. A map without its video doesn't load (the previous one stays); the map's geometry and lightmaps are never downloaded |
| `fixed-inspect.ts` | The game's fixed inspect camera over the video, and the ambient light from the light probes |
| `agent-view.ts` | An agent in third person, in its main-menu idle |
| `agent-eyes.ts` | The agents' eyes: the game's `S_EYEBALLS` (a virtual sphere at each eyeball bone, ray-traced in the head material, with the shared iris texture) |
| `agent-patches.ts` | The patches on an agent's body material: the game's `csgo_character` F_PATCHES placement (decompiled pixel shader) injected into the material |
| `firstperson.ts` | Skeletons, CPU skinning, animation clips, forearm twist constraints |
| `inspect-scene.ts`, `post.ts`, `map-veil.ts` | The map's lights and camera (the viewer loads it `lightsOnly`; the full geometry loader is still there but unused), the map's post (tone curve, bloom, LUT), the transition between maps |
| `textures.ts`, `geometry.ts` | Texture loading (WebP), geometry helpers |
| `viewer-options.ts` | Types and defaults (lighting, viewmodel, stickers, charm) |

## Shaders

The shaders are not approximations: each one comes from a decompiled shader of the game.

### Where the data is in the game files

| What | Where |
| --- | --- |
| Skin compositing, gloves, generic composite and composite inputs (`csgo_customweapon`, `csgo_customglove`, `csgo_composite_generic`, `csgo_composite_inputs`) | `game/csgo_core/shaders_vulkan_dir.vpk` |
| Weapon, sticker, character and other materials (`csgo_weapon`, `csgo_weapon_sticker`, `csgo_character`, `csgo_complex`…) | `game/csgo/shaders_vulkan_dir.vpk` |
| Paint kits, stickers, charms, agents, pins and patches (`scripts/items/items_game.txt`), skin materials (`.vmat`, `.vcompmat`), weapon and glove models, textures, the inspect camera table (`panorama/scripts/inspect.vts`), animation graphs and clips | `game/csgo/pak01_dir.vpk` |
| Inspect map backgrounds (scene, lightmaps, light probes, cubemaps) | `game/csgo/maps/<map>_vanity.vpk` |

Each shader file (`.vcs`) holds thousands of variants (static combos), stored as compressed SPIR-V. The variants used here are decompiled and turned into WebGL2. That generated code is derived from Valve's, so it stays out of git.

### The pieces (`src/lib/materials/`)

- **`composite.ts` + `composite-expr.ts`: the game's weapon compositor, as is.**
  - The game composes each skin into UV-space textures with `csgo_customweapon`: colour, and roughness / metalness / pearlescence.
  - The viewer runs the game's own shader into 2048² half-float render targets. There are 79 combos: paint style × features such as overlay, case hardening and masks.
  - The parameters come from the **VFX expression interpreter** (`composite-expr.ts`). It is the stack machine the game uses to derive parameters from the float, the seed and the kit.
  - The passes and features follow the mutators of each kit's `vcompmat`.
- **`weapon.ts` + `weapon-glsl.ts`: the weapon material (`csgo_weapon`).**
  - It reads the composite, or paints with the ported formula of each paint style (`S_PAINT_STYLE` 0–8): solid, hydro, spray, anodized, anodized multicolor, airbrush, custom, patina, gunsmith.
  - Wear goes through the weapon's AO: `smoothstep(0.58−s, 0.68+s, …·(float·6+1))`. Then come grime and PBR albedo levels driven by the float.
  - On top: pearlescence, iridescence and glitter (from `csgo_weapon`), and the stickers.
  - Debug views are listed in `DEBUG_VIEWS`.
- **`sticker.ts` + `sticker-glsl.ts`: the stickers (`csgo_weapon_sticker`).**
  - Paper; holo (a spectrum looked up by the view angle); glitter (hemi-octahedral flake normals); wear with scratches and the paper backing showing through.
  - Up to 5 per weapon, packed in a `sampler2DArray`.
- **`glove.ts` / `glove2.ts`: the gloves.**
  - Classic gloves use `csgo_customglove`: a layered composite into 4 render targets (albedo, normal, ORM, sheen).
  - Newer gloves use the v2 compositor (`vcompmat`), through the same VFX interpreter.
- **`charm.ts`: the charms**, with their per-pattern dynamic expressions and the sticker slab.
- **`csgo_character`** (in `model-loader.ts → plainMaterial`): agents and arms.
  - Roughness is in the normal map's alpha, or in `g_tAnisoGloss` for anisotropic materials.
  - Metalness is in R, and there is a material tint.

### Details that matter

- **RNG:** the Source RNG runs in `float32` (`lib/data/rng.ts`) and rolls in the game's order. Seeds 0 and 1 give the same pattern.
- **Colour spaces:**
  - AO, colour, grime and cavity are sRGB.
  - Masks, wear, position and normals are linear.
  - The pattern is sRGB in the image styles (custom, patina, gunsmith) and linear in the selector styles.
- **Derivatives:** `dFdx` / `dFdy` inside non-uniform branches are undefined in WebGL. The v2 glove emboss and the stickers take them outside the branch.
- **Shader patches:** they chain `onBeforeCompile` and `customProgramCacheKey`, once per material.
- **Map lighting:**
  - The scene's lightmaps.
  - The inspect `item` lights and the sun.
  - The light probes' ambient cube (`env_light_probe_volume_atlas`) as a `LightProbe`.
  - The environment map, for reflections only.

## Assets

The data is built from the game files by the scripts in [`../steam-tools/cs2-3d-pipeline`](../steam-tools/cs2-3d-pipeline) (its README lists them); the long notes on each finding live there too (`3dviewer.md`, `maps.md`).

The home page's hero is a video (`hero.mp4`, `hero.webm`, poster `hero.jpg`), hosted at `https://assets.chainskins.net/3d/` (`HERO_VIDEO` in `src/lib/home.ts`): it is a 360° turn of the AK-47 | Fire Serpent on Mirage, rendered frame by frame from the embed, so the home page draws no 3D.

The game assets (~33,000 files) **are not in git**. They live in `public/assets/` for development.

- **Format:** textures are served as **WebP**, about 12 GB in total.
  - Colour textures are lossy at quality 90; data textures (normals, masks, roughness…) are lossless.
  - Alpha is always lossless, and the colour under transparent pixels is kept.
  - The viewer asks for the `.webp` and falls back to the `.png` if it isn't there.
- **Hosting:** production serves them from `3dviewer` at **https://3dassets.chainskins.net/**.
- **Cache:**
  - Hashed files: one year.
  - Other media: one day.
  - JSON: five minutes.
- **CORS:** any origin can read.

`db.json` (market names, images and rarities, from `chainskins.net`) is kept in the browser's Cache Storage and reused for 3 hours (`lib/cached-json.ts`).

## Public API (embed)

**Docs and a live playground: [https://3d.chainskins.net/api](https://3d.chainskins.net/api).**

`/embed` is the viewer alone: just the 3D view, no panels. Put it in an iframe. The URL picks what it shows and how; `postMessage` drives it afterwards. A working example lives in [`public/embed-example.html`](public/embed-example.html) (`https://3d.chainskins.net/embed-example.html`).

```html
<iframe src="https://3d.chainskins.net/embed?def=7&paint=180&float=0.05&seed=1&map=de_mirage" allow="fullscreen"></iframe>
```

### Quick start: loading items with `postMessage`

Put the iframe, wait for `cs3d:ready`, then send `cs3d:load`. Check the origin both ways.

```js
const frame = document.getElementById('viewer') // <iframe id="viewer" src="https://3d.chainskins.net/embed" allow="fullscreen">
const ORIGIN = 'https://3d.chainskins.net'
const send = (message) => frame.contentWindow.postMessage(message, ORIGIN)

let ready = false
window.addEventListener('message', (e) => {
  if (e.origin !== ORIGIN || e.source !== frame.contentWindow) return
  if (e.data?.type === 'cs3d:ready') ready = true // the embed listens from now on
  if (e.data?.type === 'cs3d:loaded') console.log('shown:', e.data.item)
  if (e.data?.type === 'cs3d:error') console.warn(e.data.message)
})
```

Once `ready` is true:

```js
// Load a collectible pin
send({ type: 'cs3d:load', target: { pin: '6132' } })

// Load an agent patch on its own, on the game's inspect card
send({ type: 'cs3d:load', target: { patch: '4553' } })

// Load a pet (1 egg, 2 chick, 3 catalana, 4 silkie, 5 polish) in its 6th colour, dancing
send({ type: 'cs3d:load', target: { pet: '3' }, options: { pet_color: 5, pet_animation: 'chick_trick05' } })

// Change the pet on screen, without reloading it
send({ type: 'cs3d:set', options: { pet_color: 2, pet_animation: 'chick_idle03' } })

// Load an agent wearing patches: up to 3 slots, `id~size`, an empty entry leaves the slot empty
send({
  type: 'cs3d:load',
  target: { character: 'customplayer_tm_professional_varf' },
  options: { agent_patches: '4588~1.15,,4584~0.99' },
})

// Change the patches of the agent on screen, without reloading it
send({ type: 'cs3d:set', options: { agent_patches: '4588~1.15,4572,4584~0.99' } })

// Load an agent from its inspect link: it brings its own patches
send({ type: 'cs3d:load', target: { inspect: 'steam://run/730//+csgo_econ_action_preview%20<hex>' } })
```

Each load answers `cs3d:loading`, then `cs3d:loaded` (`item.kind` is `pin`, `patch`, `pet` or `agent`; an agent also reports `agentPatches`, a pet `petColor` and `petAnimation`) or `cs3d:error` (unknown id, bad link…).

The embed carries a small **chainskins.net** watermark in its top-left corner, linking to the full viewer, and burnt into its screenshots. It is always shown: `ui=0` does not hide it. Nothing the embed does is kept in the visitor's browser: the full viewer's lighting, viewmodel and loadout stay untouched.

Only `/embed` may be framed: `public/_headers` sends `Content-Security-Policy: frame-ancestors *` there (it overrides the zone's `X-Frame-Options: SAMEORIGIN`).

### URL parameters

What to show (one of these; if several are given, the first in this order wins):

| Param | Shows |
| --- | --- |
| `inspect` | An inspect link (`steam://rungame/730/…csgo_econ_action_preview <hex>`) or its hex. Brings the float, pattern, stickers and charm with it. Old `S…A…D…` links can't be read. |
| `def` + `paint` | A weapon or gloves by item definition index and paint index |
| `skin` | A skin by catalog key, `item\|kit` (e.g. `weapon_ak47\|cu_fireserpent_ak47_bravo`) |
| `sticker` | A sticker on its own, by id |
| `charm` | A charm on its own, by id |
| `character` | An agent, by id (`customplayer_…`). An inspect link of an agent brings its patches |
| `pin` | A collectible pin on its own, by its item definition index (`pin=6101` is the Dust II pin; the keys of db.json's `pins`) |
| `patch` | An agent patch on its own, on the game's inspect card, by its patch kit id (`patch=4553`; the keys of db.json's `patches`) |
| `pet` | A pet on its own, by its pet definition number: `1` egg, `2` chick, `3` catalana, `4` silkie, `5` polish (`pet=3`). Pets are not in db.json |

How to show it. The `loadout_*` params are what the player wears: they apply in first person (`view=fpv`) and on an agent (third person), not to the item shown.

| Param | Values | Default |
| --- | --- | --- |
| `float` | 0–1, clamped to the skin's range; wins over an inspect link's | 0, or the link's |
| `seed` | 1–1000; wins over an inspect link's | 1, or the link's |
| `view` | `orbit`, `fpv` (first person; weapons only, other items stay in orbit) | `orbit` |
| `map` | an inspect map id (`de_mirage`, `de_dust2`, `de_inferno`, `de_ancient`, `de_ancient_night`, `de_anubis`, `de_nuke`, `de_overpass`, `de_vertigo`, `de_cache`, `de_train`, `cs_italy`, `cs_office`, `ar_baggage`, `warehouse`) or `studio` | `studio` |
| `loadout_gloves` | the loadout's skin gloves, `item\|kit` | the agent's own |
| `loadout_gloves_float` | the loadout gloves' float | 0.15 |
| `loadout_gloves_seed` | the loadout gloves' pattern | the gloves' own |
| `sticker_wear` | a sticker shown on its own: its wear, 0 (pristine) – 1 | the link's, or 0 |
| `sticker_card` | `1`: a sticker shown on its own sits on the game's inspect card (the grey card with the CS2 mark) | off |
| `charm_pattern` | a charm shown on its own: its pattern | the link's, or 0 |
| `agent_patches` | the patches an agent wears: `id~size`, comma-separated, one entry per slot (3), an empty entry leaves the slot empty (`4588~1.15,,4584`); `size` 0.5–1.5 | none, or the link's |
| `loadout_weapon` | the weapon skin an agent holds (`item\|kit`, empty for none) | none |
| `loadout_weapon_float` | that weapon's float | 0.1 |
| `loadout_weapon_seed` | that weapon's pattern, 1–1000 | 1 |
| `pet_color` | a pet shown on its own: its colour as an index, 0 = the first (the egg and the chick have 1, the catalana 13, the silkie 9, the polish 12); clamped | 0 |
| `pet_animation` | a pet shown on its own: the clip it loops (`chick_idle03`, `chick_trick05` = dance, `chick_walk`, `chick_egg_reaction01` for the egg…); an unknown one plays the default idle | its first idle |
| `loadout_agent` | the loadout's agent (`customplayer_…`): its arms and sleeves in first person | the default CT agent |
| `stickers` | the weapon's stickers, `id~slot~wear~x~y~rotation~scale`, comma-separated; first load only | none, or the link's |
| `viewmodel_sway` | `0`: first person's weapon stops swaying with the pointer | on |
| `viewmodel_left_hand` | `1`: first person holds the weapon in the left hand | off |
| `side` | `front` (the initial view) or `back` (a half turn around the item: its other side) | `front` |
| `knife_pose` | how a knife stands: `vertical`, `horizontal` or `tilted`; other items ignore it. Choosing a pose brings the view back to `front` unless `side` is sent too | `tilted` |
| `auto_rotate` | `1`: the item turns on its own | off |
| `bg` | `transparent`: no backdrop, the page shows through | the studio backdrop |
| `ui` | `0`: no loading spinner or error message (the page shows its own); the watermark always stays | shown |
| `quality` | `lite`: for small or busy embeds, draws at 1× resolution without antialiasing and stops drawing while scrolled out of view | full |

A weapon's charm comes only from an inspect link. Stickers and the charm can't be changed by message yet: load another link (`cs3d:load` with `{ inspect }`) instead.

### Messages to the embed

Send them with `iframe.contentWindow.postMessage(message, '*')`. Any page may drive an embed it frames; replies go back to the sender only.

| Message | Does |
| --- | --- |
| `{ type: 'cs3d:load', target, options? }` | Shows another item. `target` is one of `{ inspect }`, `{ def, paint }`, `{ skin }`, `{ sticker }`, `{ charm }`, `{ character }`, `{ pin }`, `{ patch }`, `{ pet }`; `options` as for `cs3d:set` |
| `{ type: 'cs3d:set', options }` | Changes any of `float`, `seed`, `view`, `map`, `loadout_gloves`, `loadout_gloves_float`, `loadout_gloves_seed`, `loadout_agent`, `loadout_weapon`, `loadout_weapon_float`, `loadout_weapon_seed`, `sticker_wear`, `sticker_card`, `charm_pattern`, `agent_patches`, `pet_color`, `pet_animation`, `viewmodel_sway`, `viewmodel_left_hand`, `side`, `knife_pose`, `auto_rotate`, without reloading the page |
| `{ type: 'cs3d:setMap', map }` | Changes the map (an inspect map id, or `studio`) |
| `{ type: 'cs3d:inspect' }` | Plays the weapon's inspect animation (first person) |
| `{ type: 'cs3d:inspectGloves' }` | Looks at the gloves: in first person with skin gloves, or on a gloves skin |
| `{ type: 'cs3d:resetView' }` | Puts the camera back (and `side` to `front`) |
| `{ type: 'cs3d:screenshot', id? }` | Replies `cs3d:screenshot` with a PNG data URL (watermarked) |
| `{ type: 'cs3d:share', id? }` | Replies `cs3d:share` with the link the full viewer's share button gives: the short `/share/<code>` (everything packed in it), or the full link when the view doesn't fit a code |
| `{ type: 'cs3d:openShare' }` | Opens the full viewer's share dialog inside the embed: the link to copy, or an image card of the item to download |
| `{ type: 'cs3d:getState', id? }` | Replies `cs3d:state` with the current settings |

### Messages from the embed

They arrive as `message` events on the page's `window`. `ready`, `loading`, `loaded` and `error` are posted to the parent page with target origin `*` (they carry nothing private). Check that `event.source` is the iframe's window, and, if you know where the viewer lives, that `event.origin` is `https://3d.chainskins.net`.

| Message | When |
| --- | --- |
| `{ type: 'cs3d:ready', version }` | The embed listens for messages (protocol `version` 1) |
| `{ type: 'cs3d:loading' }` | An item starts loading |
| `{ type: 'cs3d:loaded', item }` | It is shown. `item`: `{ kind, id, floatMin, floatMax, canInspect, canInspectGloves }`, plus `stickerWear` (a sticker), `charmPattern` (a charm) or `agentPatches` (an agent: its patches, as the `agent_patches` option). It fires again when a change redraws the model (an agent's gloves or weapon, first person) |
| `{ type: 'cs3d:error', message }` | It can't be shown (unknown item, bad link, missing asset…) |
| `{ type: 'cs3d:screenshot', id, dataUrl }` | Reply to `cs3d:screenshot` |
| `{ type: 'cs3d:share', id, url }` | Reply to `cs3d:share`: the item with its float, pattern, stickers, charm, first person and loadout |
| `{ type: 'cs3d:key', key: 'Escape' }` | Escape was pressed inside the embed (an iframe with the focus keeps the keys): close it if you show it in a dialog. F (inspect, first person) and G (look at the gloves) work inside the embed itself |
| `{ type: 'cs3d:state', id, state }` | Reply to `cs3d:getState`: `{ item, share_url, float, seed, view, map, loadout_gloves, loadout_gloves_float, loadout_gloves_seed, loadout_agent, loadout_weapon, loadout_weapon_float, loadout_weapon_seed, sticker_wear, sticker_card, charm_pattern, agent_patches, viewmodel_sway, viewmodel_left_hand, side, knife_pose, auto_rotate }` |

```js
const frame = document.querySelector('iframe')
window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return
  if (e.data.type === 'cs3d:loaded') console.log('float range', e.data.item.floatMin, e.data.item.floatMax)
})
frame.contentWindow.postMessage({ type: 'cs3d:set', options: { float: 0.25, seed: 661 } }, '*')
```

## Improvements

| Area | What | Notes |
| --- | --- | --- |
| Lighting | Light on the weapon: the map's own light and the sun don't reach the weapon as they do in the game | |
| Wear | Float-driven wear of some items (mostly gloves) doesn't match the game | |

## Known issues

| Area | Issue | Example |
| --- | --- | --- |
| First person | Sleeves weighted to torso bones the viewmodel lacks (spine, clavicle, scapula, pouch jiggles) are pinned to the upper arm instead of the game's own solve; the shoulder end may differ slightly | Elite Trapper Solman (Jungle Raider) |
| Wear / Pattern | Wear appearance does not vary correctly with the pattern/paint seed; some gloves show the same wear distribution across different patterns even though the wear should affect different areas depending on the pattern | Pandora's Box |
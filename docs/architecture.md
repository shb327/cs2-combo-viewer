# Architecture

The planned pieces. Each one is decided in its own spec before it is built.

```
CS2 installation
      │
      ▼
asset pipeline ──► asset bucket (models, textures, item data)
                         │
                         ▼
                   viewer (browser) ◄── embed API ◄── Combo Skin pages
                         │
                         ▼
      screenshot worker ◄──► Combo Skin API (claims a combo, sends its PNG)
```

## Asset pipeline

Runs on a developer machine with CS2 installed. Reads the game files, extracts what the viewer needs, converts it for the web, and uploads it to a bucket. It also writes an item catalog: every knife and glove finish with its definition index, paint kit and float range.

Open questions: which extraction tools to build on, the output format for models (glTF or a custom format), and how to version assets when the game updates.

## Viewer

A static web app. Loads only the assets for the items on screen. Views:

- **Orbit:** one item, turned with the mouse.
- **First person:** a knife in gloves, with the inspect animation.

Open questions: three.js with WebGL2 first or WebGPU first, and whether to start from the MIT-licensed ChainSkins viewer or from scratch.

## Embed API

The viewer runs inside an iframe on another page (`https://view.combo.skin/combo?…`) and is driven by its URL and by
`postMessage`. The contract, as built in phase 4, is in [embed.md](embed.md); in short:

```js
// page → viewer (each with an optional id, echoed by the events it causes)
{ type: 'cs3d:load', id, combo: { knife, knife_paint, knife_float, knife_seed, gloves, gloves_paint, gloves_float, gloves_seed, agent }, view: 'fp' }
{ type: 'cs3d:inspect' }  { type: 'cs3d:setView', view }  { type: 'cs3d:getState', id }

// viewer → page
{ type: 'cs3d:ready', version, release, webgl2 }
{ type: 'cs3d:progress', id, loaded, total }
{ type: 'cs3d:loaded', id, combo, view, release, ms }
{ type: 'cs3d:error', id, code, message, retryable }
{ type: 'cs3d:recovering', id, reason }
```

The viewer accepts messages only from an allowlist of origins and posts only to its parent's, and only Combo Skin's
pages (and local development pages) may frame it.

## Screenshot worker

The viewer in a headless Chrome on a machine with a GPU ([`worker/`](../worker/README.md), phase 5). It pulls work
rather than being called: it claims one combo at a time from Combo Skin's API (a 5-minute lease), draws it with its own
build of the viewer pinned to one asset release (`/combo?capture=1`, [embed.md](embed.md#capturing)), and sends a
1920×1080 PNG back; the API stores the original and makes the watermarked WebPs. It runs on the machine that runs the
API, so nothing listens on the network for it.

## Hosting

The viewer and its assets are static files behind a CDN. Assets are large (likely around 10 GB for full coverage), so they live in an object storage bucket, not in this repository.

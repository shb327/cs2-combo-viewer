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
                 render service ──► combo screenshots
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

The viewer runs inside an iframe on another page and is driven by `postMessage`, in the same shape as existing viewers, so Combo Skin can switch between them behind one adapter.

```js
// page → viewer
{ type: 'load', knife: { def, paint, float, seed }, gloves: { def, paint, float, seed }, view: 'fpv', map }
{ type: 'screenshot', id }

// viewer → page
{ type: 'ready' }
{ type: 'progress', percent }
{ type: 'loaded' }
{ type: 'error', code, message }
{ type: 'screenshot', id, png }
```

The viewer checks the origin of every message, and only pages on an allowlist may frame it.

## Render service

The viewer in a headless browser with GPU access. Given a combo, it returns screenshots (and possibly a short turntable clip) for the combo's page. Combo Skin calls it when a combo is added.

## Hosting

The viewer and its assets are static files behind a CDN. Assets are large (likely around 10 GB for full coverage), so they live in an object storage bucket, not in this repository.

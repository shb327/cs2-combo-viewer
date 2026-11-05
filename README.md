# cs2-combo-viewer

A browser 3D viewer for Counter-Strike 2 knife and glove combinations: a skinned knife held in skinned gloves, in first person, with float and pattern for both.

It is being built for [Combo Skin](https://github.com/shb327/combo-skin), a site for finding good-looking glove and knife combos, where every combo page will offer a 3D view next to its screenshot.

**Status:** phase 1 done: a Karambit in Specialist Gloves, first person, built from the game files by our own pipeline. Phase 2 (that combo matching the game) is in progress: part A (the gloves on a Vertigo background) is done, part B (the hands and the knife) is in review. See the [roadmap](docs/roadmap.md).

## Layout

- [`viewer/`](viewer/): the browser viewer (React, TypeScript, Vite, three.js). `cd viewer; npm.cmd ci; npm.cmd run dev`.
- [`pipeline/`](pipeline/README.md): builds the viewer's assets from copies of the game files.

## Goals

- Show any knife and glove finish together in first person, at any float and pattern seed, close to how it looks in game.
- Run in the browser, on demand: pages show a screenshot first and load 3D only when asked.
- Embed in other pages through an iframe and a small `postMessage` API.
- Render screenshots of a combo without a person at the keyboard, so every combo page has an image.

## Docs

- [Landscape](docs/landscape.md): existing CS2 viewers and what can be learned from them.
- [How it works](docs/how-it-works.md): where the data comes from and how a skin is drawn.
- [Architecture](docs/architecture.md): the planned pieces and how Combo Skin talks to them.
- [Roadmap](docs/roadmap.md): phases, from a first rendered skin to a full combo viewer.
- [Asset format](docs/asset-format.md): the files the viewer loads.

## Credits

The viewer started from the [ChainSkins 3D Viewer](https://github.com/ChainSkins/cs2-3d-viewer) (MIT, copyright 2026 ChainSkins; see [viewer/LICENSE](viewer/LICENSE) and [viewer/UPSTREAM.md](viewer/UPSTREAM.md)). The pipeline uses [ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat) (MIT).

## Game assets

Models, textures, shaders and maps belong to Valve and are not in this repository. They are extracted locally from a Counter-Strike 2 installation.

Not affiliated with or endorsed by Valve Corporation. Counter-Strike and CS2 are trademarks of Valve Corporation.

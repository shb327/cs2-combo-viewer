# cs2-combo-viewer

A browser 3D viewer for Counter-Strike 2 knife and glove combinations: a skinned knife held in skinned gloves, in first person, with float and pattern for both.

It is being built for [Combo Skin](https://github.com/shb327/combo-skin), a site for finding good-looking glove and knife combos, where every combo page will offer a 3D view next to its screenshot.

**Status:** planning. No code yet.

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

## Game assets

Models, textures, shaders and maps belong to Valve and are not in this repository. They are extracted locally from a Counter-Strike 2 installation.

Not affiliated with or endorsed by Valve Corporation. Counter-Strike and CS2 are trademarks of Valve Corporation.

# Landscape

Browser 3D viewers for CS2 skins already exist. This page records what they do and what they show is possible. Observations are from public pages and public source code, as of November 2026.

## What a combo view needs

A knife in first person, held in gloves, each with its own finish, float and pattern seed. Most viewers show one item at a time. Only some can put a skinned knife in skinned gloves.

## Viewers

| Viewer | Knife in gloves, first person | Embeddable | Source |
| --- | --- | --- | --- |
| [SkinCraft](https://skincraft.gg/) | Yes | By agreement only | Closed |
| [ChainSkins 3D Viewer](https://3d.chainskins.net/) | Yes | Yes, public embed | [Open, MIT](https://github.com/ChainSkins/cs2-3d-viewer) |
| Skinport 3D, SteamAnalyst Inspect, skinweb.io, CSDB, csskincrafts, SkinHub, Market.CSGO, Skin.Land | Not checked | Not checked | Closed |

### SkinCraft

- About 13,500 items: weapons, knives, gloves, stickers, charms, agents, pets.
- Equip gloves, load a knife, switch to the in-hand view: the knife is shown in those gloves on an inspect map. Seed and wear are set per item. Screenshot and video recording are built in.
- Runs on WebGPU, with WebAssembly decoding. Textures are served as AVIF from its own CDN.
- Pages per item: `/weapons/<weapon>/<finish>`, `/gloves/<gloves>/<finish>`.
- An embed exists (`/embed`), loaded in an iframe and driven by `postMessage` with the item's Steam inspect code. CSFloat's open-source browser extension shows how the protocol works: `ready`, `progress`, `loaded` and `error` events, and `load`, `pause`, `resume` and `clear` commands.

### ChainSkins 3D Viewer

- MIT-licensed viewer code: React, TypeScript, Vite, three.js, WebGL2.
- Its shaders are ports of the game's own decompiled shaders. That generated code, and the game assets, are kept out of its repository.
- First person with gloves: `view=fpv` plus `loadout_gloves`, `loadout_gloves_float` and `loadout_gloves_seed`. The knife is set by definition index and paint index, a skin key, or an inspect link.
- Public embed (`/embed`) with a documented `postMessage` API: `cs3d:load`, `cs3d:set`, `cs3d:inspect`, `cs3d:screenshot` (returns a PNG) and more. A watermark is always shown.
- About 33,000 asset files, roughly 12 GB as WebP.
- Its asset pipeline is not public.

## Takeaways

- The hard parts are known and solved more than once: compositing the game's paint kits, glove materials, first-person rigs and animation, and inspect map backgrounds.
- ChainSkins' README is the best public write-up of where each piece lives in the game files and how its shaders work.
- An embed with an iframe and `postMessage` is the established integration shape. Matching it lets a page swap one viewer for another.
- Asset size (about 12 GB) and asset extraction are as much work as rendering.

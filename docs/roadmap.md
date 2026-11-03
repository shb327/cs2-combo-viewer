# Roadmap

Each phase ends with something that runs. Later phases are rough and will change.

| Phase | Result | Status |
| --- | --- | --- |
| 0. Research | How existing viewers work and where the data lives ([landscape](landscape.md), [how it works](how-it-works.md)) | Done |
| 1. Pipeline spike | Our own pipeline feeding the ChainSkins-based viewer: Karambit \| Doppler (Ruby) in Specialist Gloves \| Crimson Kimono, first person, Terrorist arms | Done |
| 2. One combo, right | The phase 1 combo matching the game side by side, with the inspect animation, on Vertigo | Next |
| 3. Coverage | Every knife and glove finish; the full asset pipeline; hosting | |
| 4. Embed API | The viewer in an iframe, driven by `postMessage`, used from a Combo Skin test page | |
| 5. Screenshots | Headless rendering of a combo to images (Terrorist agent on Vertigo) | |
| 6. Polish | Map and agent choice for visitors, attack animations, performance on low-end devices | |

## Decisions

- Start from the MIT-licensed ChainSkins viewer (React, TypeScript, Vite, three.js, WebGL2), imported as a filtered copy into `viewer/` (see `viewer/UPSTREAM.md`).
- The pipeline builds on the ValveResourceFormat library (C#, `pipeline/shader-dump`) and Node scripts.
- The game's own compositing shaders are used, exported per static combo and converted to WebGL2; the generated code stays with the assets, out of git.
- Default view and every combo screenshot: a Terrorist agent on Vertigo. Visitors will later choose the map and the agent, so the viewer's map, agent and viewmodel support stays.

## Phase 1: what was learned

- **ChainSkins' repository contains game-derived files** (a generated glove shader, the game's item icons). They were left out of the import; the viewer now loads every generated shader from the asset folder at runtime.
- **The viewer needs the game's compositing shaders as generated code**, not only its hand-written ports: the weapon compositor (`csgo_customweapon`, 1152 static combos) and the glove compositor (`csgo_customglove`, 6). Source 2 Viewer's command-line tool only dumps one variant, so `shader-dump` uses the library to export every combo with its parameter table and expressions. The converter's output compiles in WebGL2 with three changes: the uniform block flattened, separate textures and samplers merged, layer families packed into texture arrays (WebGL allows 16 textures, the glove shader uses 21 to 37). 8 weapon combos need 17 textures and are skipped for now.
- **Kits are vcompmats**, not just materials: `weapons/paints/**/<kit>.vcompmat` and `gloves/paints/<kit>.vcompmat`, each including a shared `_shared_paint_generic.vcompmat` that defines the passes and the seed's rolls. Their structure maps directly onto the viewer's kit layers. `vmt_path` in `items_game.txt` is out of date for gloves, and a kit's `style` can differ from its material (Ruby: 5 in items_game, `F_PAINT_STYLE 4` in the material; the material is what renders).
- **Crimson Kimono is a classic glove** (combo 0). The classic glove code was moved onto the same machinery as the newer gloves, with every parameter (including the colour-adjust matrices) evaluated from the game's own expressions.
- **Models export cleanly**: node names, draw-call order, units and joint indices are what the viewer expects. The default Terrorist (Phoenix) has `firstperson_sleeves` and `firstperson_default_gloves_arms` mesh groups; the knife's idle clip runs on `viewmodel.vnmskel`.
- **Inspect maps need a rendered video** of the map from the inspect camera (`backgrounds/<id>.mp4`), which the game files don't contain.
- Sizes as PNG (no WebP yet): Karambit model 1.0 MB + 9.2 MB textures; Doppler (Ruby) 16.6 MB; Specialist Gloves model 1.2 MB + 9.6 MB; Crimson Kimono 34.4 MB; Terrorist arms model 1.9 MB + 31.8 MB textures; all shaders 22 MB.

## Phase 2 needs

- **Side-by-side check with the game**: reference screenshots of the combo from the game, taken by you; fix what differs (wear at several floats, pattern seeds, lighting, colour).
- **Inspect and knife animation**: the knife's own skeleton and bind (`weapon_skeletons.json`, `weapon_binds.json`) and its track in the clips, so the inspect plays and the knife sits exactly in the hand.
- **Forearm twist constraints** from the agent model, so wrists twist like the game.
- **Vertigo**: its `scenes.json` (cameras, lights, light probe, post) and HDR from `de_vertigo_vanity.vpk`, and a way to produce the background video (render it in the viewer from the map's geometry and lightmaps, or another approach to decide).
- **Textures as WebP** (needs an encoder; a tool to approve), and only the textures first person needs (the build also extracts the third-person body's).
- **Newer (v2) gloves** in the build (their compositor data and roll groups), and the 8 skipped weapon combos.
- sRGB layer arrays stored as sRGB (now packed as 8-bit linear, losing precision in dark tones).

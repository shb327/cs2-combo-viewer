# How it works

How a CS2 skin gets from the game files to a browser. Notes to build on, not a final design.

## Where the data lives

| What | Where in a CS2 installation |
| --- | --- |
| Item definitions: knives, gloves, paint kits, float ranges, rarities | `scripts/items/items_game.txt` in `game/csgo/pak01_dir.vpk` |
| Weapon and glove models, skin materials (`.vmat`), paint kit compositions (`.vcompmat`), textures | `game/csgo/pak01_dir.vpk` |
| First-person arms, animation graphs and clips, the inspect camera table | `game/csgo/pak01_dir.vpk` |
| Skin compositing and glove shaders | `game/csgo_core/shaders_vulkan_dir.vpk` |
| Weapon and character material shaders | `game/csgo/shaders_vulkan_dir.vpk` |
| Inspect map backgrounds: scene, lightmaps, light probes, cubemaps | `game/csgo/maps/<map>_vanity.vpk` |

Tools: [Source 2 Viewer (ValveResourceFormat)](https://github.com/ValveResourceFormat/ValveResourceFormat) reads these files and exports models to glTF. It does not apply skins.

## Identifying an item

An item is a definition index (which knife or gloves) plus a paint kit (which finish), a float (wear, 0 to 1, within the kit's range) and a pattern seed (1 to 1000).

A Steam inspect link carries the same data as a hex-encoded protobuf. Viewers accept either form.

## Drawing a skin

1. **Composite the paint kit.** The game draws each skin into UV-space textures with its compositing shader: colour, plus roughness, metalness and pearlescence. The paint style (solid, hydrographic, spray, anodized, custom, patina, gunsmith and others), the float and the seed drive it.
2. **Apply the weapon material.** The composited textures feed the weapon shader: wear through ambient occlusion and grime, PBR shading, and effects such as pearlescence.
3. **Gloves** use their own material with grunge and wear driven by float and seed.
4. **First person** needs the arms model, the knife and gloves on the same skeleton, skinning and animation clips (idle, inspect, attacks).
5. **Background** is an inspect map: a pre-rendered backdrop, its lighting and post-processing.

A faithful result comes from running the game's own shader logic, ported to the browser. Approximations look wrong on the finishes people care about most (Fade, Case Hardened, Doppler).

## Rendering in the browser

- three.js with WebGL2 works everywhere modern. WebGPU is faster and is what the best viewer uses, but not every browser has it.
- Textures should be compressed for the web (WebP or AVIF) and loaded on demand per item.
- A screenshot can be taken from the canvas. For screenshots without a person, the same viewer runs in a headless browser with GPU access.

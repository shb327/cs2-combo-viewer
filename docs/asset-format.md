# Asset format

What the viewer (`viewer/`) loads, and in what shape, worked out from its loading code and checked against files our pipeline builds. Everything is fetched from the **asset base** (`VITE_ASSET_BASE`, default `/assets/`; the dev server serves it from `C:/cs2-data/extracted/web`, see `viewer/vite.config.ts`).

```
<asset base>/
  extracted/viewer/          the viewer's own data (VIEWER_DATA)
    index.json               catalog: items and skins
    items/<item>.json        one per knife / gloves
    kits/<kit>.json          one per paint kit
    agents.json              agents and their models
    firstperson/             poses, skeletons, clips
    shaders/                 the game's compositing shaders, converted (customweapon.json, cw_<id>.frag.glsl, customglove.json, cg_<id>.frag.glsl)
    maps.json, scenes.json   inspect maps (optional)
    stickers.json, charms.json, pins.json, patches.json, pets.json, pets/anim_index.json   out of scope: empty stand-ins
  extracted/game/            decoded game files at their game paths (GAME_ROOT)
    <model>.glb
    <texture>.png | .exr
```

All paths inside the JSON are relative to `extracted/game/` unless noted. Every file under `extracted/` is derived from the game and stays out of git.

## Models (`.glb`)

- One glTF node per mesh, named `<model path>.vmdl_c.<mesh name>` (for example `…/weapon_knife_karambit.vmdl_c.body_legacy`). The viewer matches a draw-call list to a node by the **end** of its name (`nameDrawCalls` in `lib/viewer/geometry.ts`), after three.js strips `.`, `/` and `:`.
- One primitive per draw call, in the order of the draw-call list. Materials are not used.
- Metres, Y up: glTF = (Source y, z, x) × 0.0254.
- `JOINTS_0` / `WEIGHTS_0` index the **model skeleton in the JSON**, bone for bone (no glTF skin is needed or read); weights sum to 1. Skinning is done on the CPU (`lib/viewer/firstperson.ts`).
- Only the Meshopt decoder is configured: no Draco, no KTX2.

## Textures

- `.png` paths in the JSON; the viewer tries `<name>.webp` first, then the `.png` (`lib/viewer/textures.ts`). `flipY = false`, repeat wrapping.
- Float textures (the weapons' position maps) are `.exr`, loaded as is.
- sRGB or linear is decided by the caller: base colours, grunge and AO are sRGB; normals, masks, roughness, wear are linear. For the compositing shaders, each texture follows the shader's own `SrgbRead` flag (`ps[name].srgb` in the shader table), the pattern being sRGB only for paint styles 6 and up.
- Classic glove kits keep their material's `.vtex` paths; the viewer swaps `.vtex` for `.png`.

## `index.json`

```ts
{ items: { [item]: { displayName, type, glb: boolean, meshes: string[], defindex } },
  skins: { item, kit, name, paintIndex, style /* F_PAINT_STYLE, null for gloves */, shader, rarity, floatMin, floatMax, render }[] }
```

## `items/<item>.json`

```ts
{ name /* weapon_knife_karambit, specialist_gloves */, displayName, type, class, glb,
  meshes: { [mesh]: DrawCall[] }, stickerSlots: [], keychainAnchors: [] }

DrawCall {
  material /* .vmat path */, shader?, missing?, sticker?,
  color, normal, rough /* the material's g_tMetalness */, ao, aniso?, tint? /* sRGB */,
  leftAttr? /* glove hand material with the "left" attribute */,
  composite?: { uvScale, weaponLength, separateChannels, ao, color, masks, rough, pos /* .exr */, surface }  // the weapon's composite_inputs
}
```

- Knives: the mesh used is `body_hd`, else `body_legacy` (`kit.legacyModel`), else the first mesh matching `body`.
- Gloves: only meshes whose name contains `viewmodel` are used; a primitive is a hand when its material is `glove_<name>_left|right`, the arm when it starts with `bare_arm`.

## `kits/<kit>.json`

```ts
{ name, displayName, index, rarity, floatMin, floatMax, legacyModel, shader, style,
  params: { [var]: number | number[] },     // the paint material's values and the loose variables' defaults
  textures: { [var]: path },
  rolls: { var, min?: number[], max?: number[], fixed? }[],   // the seed's rolls, in the game's order
  rollGroups?, passes?: { [target]: KitLayer[] }, materialLayers?: KitLayer[], compositor? }

KitLayer = { params, textures }                 // values
         | { container: 'composite_inputs' | 'target' }   // the item's own containers, resolved at runtime
         | { copy: [alias, property, target] }
```

Which path a kit takes:

| Kit | Path | Needs |
| --- | --- | --- |
| `csgo_customweapon.vfx` with `passes.g_tColor` and `passes.g_tMetalness`, and a `composite` on the item's draw call | the game's weapon compositor (`lib/materials/composite.ts`) | `shaders/customweapon.json`, `shaders/cw_<combo>.frag.glsl` |
| `csgo_customweapon.vfx` without passes | the hand-ported paint styles (`lib/materials/weapon.ts`) | pattern, masks, position, surface per style |
| `csgo_customglove.vfx`, no `compositor` (classic: Crimson Kimono) | the game's glove compositor, combo from the paint's features (0, or 2 with anisotropic gloss) | `shaders/customglove.json`, `shaders/cg_<combo>.frag.glsl` |
| `csgo_customglove.vfx` with `compositor` and `passes.g_tColor` (newer gloves) | the same compositor, combo 7 | the same files |

The passes and layers mirror the kit's `.vcompmat` (and the `_shared_paint_generic.vcompmat` it includes): each `GENERATE_TEXTURE` mutator becomes a pass starting from its initial container, `COPY_MATCHING_KEYS` / `COPY_PROPERTY` / `SET_VALUE` become layers, and the `RANDOM_ROLL_INPUT_VARIABLES` mutator gives `rolls`.

## `shaders/` (the compositing shaders)

Built by `pipeline/shader-dump` and `pipeline/convert-shaders.mjs`; derived from the game's shaders, never committed.

```ts
// customweapon.json, customglove.json
{ shader, features: string[], static: string[] /* static combos, S_PAINT_STYLE first */, sets?: string[],
  ps: { [var]: { default: number[], elements, int?, srgb?, expr?: Instr[] } }, vs: { … },
  combos: { [id]: { values, uniforms: [name, glslType][], textures: string[], inputs: { [location]: varying }, sets: string[] } } }
Instr = [byteOffset, op, ...args]   // the game's parameter expressions, run by lib/materials/composite-expr.ts
```

- Combo id: mixed radix over `static`, 9 values for `S_PAINT_STYLE`, 2 for every other (the game's own numbering).
- Fragment shaders: GLSL ES 3.00 without `#version`, plain `uniform` declarations, one output, inputs named as `combo.inputs` (the vertex shaders are rebuilt in the viewer's code). Layer families of 4 textures (glove detail, grunge, damage…) are packed into `sampler2DArray`s to stay under WebGL's 16 textures.
- The glove compositor runs once per output mode (albedo, normal, metalness, AO) and is resolved into the material's maps (`lib/materials/glove-shared.ts`).

## `agents.json`

```ts
{ agents: { id /* customplayer_t_map_based */, index, name, model, team: 't' | 'ct', rarity }[],
  models: { [model]: { glb, body, skeleton: ArmsSkeleton, drawCalls: { [mesh]: DrawCall[] } } } }
```

First person uses the mesh groups `firstperson_sleeves` (always) and `firstperson_default_gloves_arms` (when no skin gloves; its `bare_arm` material gives the skin colour under skin gloves). The default agent is `customplayer_t_map_based`.

## `firstperson/`

| File | Required | Content |
| --- | --- | --- |
| `index.json` | yes | `{ [item]: poseFile }` |
| `<poseFile>` | yes | `{ clip, viewmodel: BonePose }` with `BonePose = { bones, parents, pose: [t[3], q[4] xyzw, scale][] }`: the knife's idle, first frame, on the viewmodel skeleton (must have `wpn`, `wpnHand_L/R`) |
| `arms.json`, `arms_models.json` | yes / optional | `ArmsSkeleton` of the glove models (`{ [vmdl]: … }` for models with their own bone order) |
| `idle_index.json` + `idle/*` | optional | keyed by pose file; `InspectClip` looped |
| `inspect_index.json` + `inspect/*` | optional | `{ [item]: file }`; `InspectClip = { clip, duration, frames, viewmodel: { bones, parents, tracks: [translations, rotations][] } }` (one value, or one per frame) |
| `weapon_binds.json`, `weapon_skeletons.json`, `attack_index.json` | optional | the knife's bind, own skeleton, attack clips |

`ArmsSkeleton = { bones, parents /* -1 root, parents first */, pos: number[3][], rot: number[4][] /* parent space, Source inches */, twists? }`.

Skeletons and clips are in Source space (x forward, y left, z up, inches); meshes are in glTF space.

## Inspect maps

Not built yet. The studio background needs no files. An inspect map needs `maps.json`, `maps/<id>.hdr` (reflections), `scenes.json` (cameras, lights, light probe, post) and **`backgrounds/<id>.mp4`**, a pre-rendered video of the map from the inspect camera that the game files don't contain: it has to be rendered.

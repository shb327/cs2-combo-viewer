# Roadmap

Each phase ends with something that runs. Later phases are rough and will change.

| Phase | Result | Status |
| --- | --- | --- |
| 0. Research | How existing viewers work and where the data lives ([landscape](landscape.md), [how it works](how-it-works.md)) | Done |
| 1. Pipeline spike | Our own pipeline feeding the ChainSkins-based viewer: Karambit \| Doppler (Ruby) in Specialist Gloves \| Crimson Kimono, first person, Terrorist arms | Done |
| 2. One combo, right | The phase 1 combo matching the game side by side, with the inspect animation, on Vertigo. In parts A to D (below), one branch and pull request each | Done |
| 3. Coverage | Every knife and glove finish; the full asset pipeline; hosting. In parts A (build everything) and B (hosting) | Done |
| 4. Embed API | The viewer in an iframe, driven by `postMessage`, used from a Combo Skin test page ([embed.md](embed.md)) | Done |
| 5. Screenshots | Headless rendering of a combo to images (Ricksaw on Vertigo, or the combo's own agent): the worker ([worker/](../worker/README.md)) | In review |
| 6. Polish | Map and agent choice for visitors, attack animations, performance on low-end devices | |

## Decisions

- Start from the MIT-licensed ChainSkins viewer (React, TypeScript, Vite, three.js, WebGL2), imported as a filtered copy into `viewer/` (see `viewer/UPSTREAM.md`).
- The pipeline builds on the ValveResourceFormat library (C#, `pipeline/shader-dump`) and Node scripts.
- The game's own compositing shaders are used, exported per static combo and converted to WebGL2; the generated code stays with the assets, out of git.
- Default view and every combo screenshot: Lt. Commander Ricksaw | NSWC SEAL (a CT agent, bare dark forearms) on Vertigo,
  unless the combo passes its own agent. Until phase 2B the default was the Default T Agent (Phoenix), whose light arms
  didn't match the reference. Visitors will later choose the map and the agent, so the viewer's map, agent and viewmodel
  support stays.

## How an agent is chosen

- Built agents are listed in `pipeline/items.json` (`agents`, by item name from `items_game.txt`: Ricksaw is
  `customplayer_ctm_st6_varianti`, model `agents/models/ctm_st6/ctm_st6_varianti.vmdl`). Only built agents can be shown.
- Default: `DEFAULT_AGENT` in `viewer/src/lib/data/agents.ts` (`customplayer_ctm_st6_varianti`), the same in the app and
  the embed.
- The combo embed (phase 4): `agent=<item definition index>` in its URL or in `cs3d:load`'s combo; empty is the
  default ([embed.md](embed.md)).
- Per load (the older item embed): the embed's `loadout_agent=<id>` URL parameter, or `loadout_agent` in the options of `cs3d:load` /
  `cs3d:set`; in the app, `fpa=<id>` (else the visitor's last pick, else the default). A combo screenshot passes its
  own agent this way (for example to show custom sleeves).
- First person draws the agent's `firstperson_sleeves` (Ricksaw has none) and, under skin gloves, the glove model's arm
  in the agent's skin (`bare_arm_*` from `firstperson_default_gloves_arms`; Ricksaw: `bare_arm_135`).

## Phase 1: what was learned

- **ChainSkins' repository contains game-derived files** (a generated glove shader, the game's item icons). They were left out of the import; the viewer now loads every generated shader from the asset folder at runtime.
- **The viewer needs the game's compositing shaders as generated code**, not only its hand-written ports: the weapon compositor (`csgo_customweapon`, 1152 static combos) and the glove compositor (`csgo_customglove`, 6). Source 2 Viewer's command-line tool only dumps one variant, so `shader-dump` uses the library to export every combo with its parameter table and expressions. The converter's output compiles in WebGL2 with three changes: the uniform block flattened, separate textures and samplers merged, layer families packed into texture arrays (WebGL allows 16 textures, the glove shader uses 21 to 37). 8 weapon combos need 17 textures and are skipped for now.
- **Kits are vcompmats**, not just materials: `weapons/paints/**/<kit>.vcompmat` and `gloves/paints/<kit>.vcompmat`, each including a shared `_shared_paint_generic.vcompmat` that defines the passes and the seed's rolls. Their structure maps directly onto the viewer's kit layers. `vmt_path` in `items_game.txt` is out of date for gloves, and a kit's `style` can differ from its material (Ruby: 5 in items_game, `F_PAINT_STYLE 4` in the material; the material is what renders).
- **Crimson Kimono is a classic glove** (combo 0). The classic glove code was moved onto the same machinery as the newer gloves, with every parameter (including the colour-adjust matrices) evaluated from the game's own expressions.
- **Models export cleanly**: node names, draw-call order, units and joint indices are what the viewer expects. The default Terrorist (Phoenix) has `firstperson_sleeves` and `firstperson_default_gloves_arms` mesh groups; the knife's idle clip runs on `viewmodel.vnmskel`.
- **Inspect maps need a rendered video** of the map from the inspect camera (`backgrounds/<id>.mp4`), which the game files don't contain.
- Sizes as PNG (no WebP yet): Karambit model 1.0 MB + 9.2 MB textures; Doppler (Ruby) 16.6 MB; Specialist Gloves model 1.2 MB + 9.6 MB; Crimson Kimono 34.4 MB; Terrorist arms model 1.9 MB + 31.8 MB textures; all shaders 22 MB.

## Phase 2: parts

Phase 2 is split into parts, one branch and one pull request each. Every check uses Specialist Gloves | Crimson Kimono at
pattern seed 269 holding Karambit | Doppler (Ruby), Ricksaw (the reference's agent; Terrorist in part A), against reference screenshots taken in game. The
screenshots live in `C:\cs2-data\reference` (never in git): `kimono-seed269.jpg` (1280×676, the reference, taken on another
map) and `vertigo-background.jpg` (3840×2160, Vertigo with no hands, weapon or HUD).

### A: the gloves right, on Vertigo (branch `phase-2a-gloves`)

Fixed:

- **Pattern far too large and the same for every seed.** Not the scale or the rolls: `GloveFinish.update` set the fragment
  shader's uniforms (with the seed's `g_vPatternTexCoordXform0/1`), then evaluated the vertex stage's variables, which share
  those two names, and three.js shares one uniform between both stages: the seed's placement was reset to the vertex table's
  default (identity), so the pattern was drawn at scale 1 instead of 2.3, unrotated and unshifted. Names the fragment shader
  declares now keep their value. The game's own icon (`panorama/images/econ/default_generated/specialist_gloves_…_light_png`)
  was a second reference for the lattice size.
- **Hands too small and too low.** `viewmodel_fov` is now the horizontal angle on a 16:9 screen (68 → 41.6° vertical); the
  vertical reading (68) and the horizontal-at-4:3 one (53.6°) both drew the hands 1.3× to 1.6× too small, and matching
  needed offsets outside the game's range. The default offsets (0.5, 0, 1) are **fitted** to the reference, whose
  viewmodel settings are unknown; an overlay of the two lines up (knife and right hand almost exactly).
- **Vertigo as the default background**: `pipeline/build-maps.mjs` builds, from `de_vertigo_vanity.vpk`, the sun
  (`light_environment`: direction, colour, brightness 2), an ambient cube from its sky colour × intensity (from above) and
  sky ambient bounce (from below), read as irradiance, the vanity scene's baked cubemap (`env_combined_light_probe_volume`)
  for reflections, and the exposure (middle of the post volume's range); the background is the screenshot, copied to
  `backgrounds/de_vertigo.jpg`. The viewer shows a still image when a map has no video, loads `.exr` panoramas, and opens on
  Vertigo (app and embed; `map=studio` for the studio). The shader tool gained an `entities` kind (entity lumps as text).

Found, not changed:

- The glove compositor converts its tints from sRGB itself and writes linear albedo: colour space is right. The gloves
  looked lighter mostly from the studio lighting; on Vertigo they sit close to the reference.
- The seed: the right-hand material (`glove_specialist_right`, `seed_offset` 1) rolls with `g_nRandomSeedAlt`, set by game
  code. The viewer gives it seed + 1, the left hand the seed; renders of 268–270 per hand were compared with the reference
  and + 1 fits as well as any, but it isn't proven. The kit JSON lists the rolls twice: they're the two conditional roll
  sets (seed and alt seed), not a bug.
- The arms' skin: the Default T Agent (Phoenix) uses `bare_arm_133` (light); the reference's agent is Ricksaw
  (`bare_arm_135`, dark), the default since part B.
- The v2 glove path (`glove2.ts`) evaluates both stages' expressions into the same shared uniforms too; with combo 7 the
  vertex stage reads them, so its fragment and vertex values can't differ. To check with part D.

Left (A):

- The left hand's pose (wrist bent down, fingers) differs a little from the reference: the idle's first frame vs a later
  frame, and no forearm twist (part B).
- Lighting is matched by eye: the view direction on Vertigo is unknown (the eye looks 30° right of the sun's travel), the
  game's tone curve and colour grade (`de_vertigo_prefab.vpost`, a PostProcessing resource the tool can't decode yet) are
  not applied (ACES is), and the probes at the player's spot aren't read. Vertigo's grade is strongly desaturated (see the
  background); the hands are not graded with it.
- sRGB layer arrays and the composited maps are 8-bit linear (banding in dark tones): see part C.

Tools (outside git, `C:\cs2-data\tools`): `shot.mjs` (headless Chrome screenshot of the dev server over the DevTools
protocol, `EVAL`/`SAVE` to run code and save data URLs), `compose.mjs` (crops, side by side or as 50% overlays). The
reference URL: `/embed?skin=weapon_knife_karambit%7Cam_ruby_marbleized&view=fpv&loadout_gloves=specialist_gloves%7Cspecialist_kimono_diamonds_red&loadout_gloves_seed=269&loadout_gloves_float=0.15&ui=0&viewmodel_sway=0`.

### B: the hands and the knife (branch `phase-2b-hands`, PR #3)

Side by sides in `C:\cs2-data\reference\compare\b*.png` (`b2-SIDE-BY-SIDE.png`: the reference and today's default).

Fixed:

- **Pinched wrists.** The build wrote `twists: []`: the forearm twist bones stayed at bind while the hand turned. The
  constraints are in each model's key values (`m_modelInfo.m_keyValueText`, KV3 text, `BoneConstraintList`), bones named
  by hash (MurmurHash2 of the lower-case name, seed `0x31415926`; `pipeline/lib/kv3.mjs`). The glove and agent models
  have the same 8 arm `CTiltTwistConstraint`s: `arm_lower_*_TWIST` / `TWIST1` take 0.5 / 1 × the hand's roll,
  `arm_upper_*_TWIST` / `TWIST1` −1 / −0.5 × the upper arm's, each measured from its target's `m_qOffset` (now in the
  data; the viewer's hard-coded table is gone). Also there, not used: a `CPointConstraint` and two `CAimConstraint`s
  (scapulae; the viewer already aims those) and leg / head twists.
- **Default agent**: Lt. Commander Ricksaw | NSWC SEAL (see "How an agent is chosen"); the reference shows him.
- **The knife on its own skeleton**: clips carry the knife's track as a secondary animation on
  `animation/skeletons/weapons/knife_karambit.vnmskel` (`weapon`, `weapon_offset`, `econ`), now exported (`secondary`
  in the clip JSON, `weapon` in the viewer's pose and clips) with `weapon_skeletons.json` (the model's skeleton:
  `weapon`, `weapon_offset`, `ag1_hand_r`) and `weapon_binds.json`. The track's root sits at the hand's `wpn` bone; the
  model's bind has its root 0.5 in up, so the knife now sits 0.5 in lower than before. The track barely moves (even in the
  inspect): the knife's motion is the `wpn` bone's.
- **The knife's angle and the hands' size: the view.** The viewmodel graph (`viewmodel.vnmgraph`) only adds two
  TwoBoneIK nodes (each hand to `wpnHand_*`, the left one off on `WPN_DISABLE_LEFT_HAND_IK`), and in the Karambit's idle
  and inspect both hands already sit on their targets (< 0.002 in, < 0.2°): the arms are the clip, so the rest is the
  camera. `viewmodel_fov` is now read as Source reads FOVs, the horizontal angle on a 4:3 screen (68 → 53.6° vertical;
  part A read it on 16:9), and the defaults are refitted: FOV 59, offsets 1.25 / 0.25 / 1.25, the best overlap (IoU 0.42,
  was 0.13) of the reference's red pixels (glove red, Ruby blade) with the viewer's, by a coordinate search through the
  embed (`C:\cs2-data\tools\fit.mjs`). On 16:9 the best fit sat at the game's limits (FOV 68, forward 2) and scored 0.35.
  The Karambit's ring now shows and the blade is foreshortened as in the game; the left hand is smaller and flatter.
  The embed takes `viewmodel_fov` and `viewmodel_offset_x/y/z` (the game's ranges); the app's saved viewmodel moved to
  `viewmodel-v3`.

Found, not changed:

- **The reference's capture is unknown** (1280×676: possibly a crop of a bigger frame; viewmodel settings unknown), so the
  view is a fit, not the game's values. A full, uncropped screenshot with known `viewmodel_fov` / `viewmodel_offset_*`
  would settle it.
- `idle1_karambit` is the right idle: the graph picks idle1 or idle2 by `idle_variation`; idle2 turns the hand up
  further than the reference. The idle moves the hand under 2°.
- **The inspect** (`lookat01_karambit`, 4.87 s) plays through and returns to the idle (`b3-inspect-grid.png`): the hand
  turns palm out and the knife spins on the index finger. Not checked against the game: no inspect reference yet.
- **The leather and skin colour is the light, not the material.** In the same spots the leather-to-skin ratio matches
  the game (palm 0.32 vs 0.37); both are lighter and bluer in the viewer. Ricksaw's arm texture (`bare_arm_135`) averages
  sRGB (126, 92, 83); the viewer renders it about (197, 165, 147), the game about (165, 113, 74) under the reference map's
  warm light. Vertigo's light in the viewer is brighter and cooler (bluish sky ambient, fog-grey), with no colour grade.
  The reference was taken on another map, so Vertigo's light can't be matched against it. Needs: a reference on Vertigo
  (same combo, same agent), then the exposure and ambient from the map's probes, and the grade (`de_vertigo_prefab.vpost`).

Left (B):

- Colour and brightness on Vertigo (above).
- The inspect against a game video; the left hand's last differences (fingers a little more curled in the viewer).

### C: framing and smaller downloads (branch `phase-2c-size`)

Measured with `C:\cs2-data\tools\loadtime.mjs` (headless Chrome, cold cache, the production build on `vite preview`,
which now serves the asset folder too): the reference URL, the time the embed posts `cs3d:loaded`. Results and images
in `C:\cs2-data\reference\compare\c*`.

Before: one combo downloaded **82.4 MB** in 121 requests (44 of them `.webp` misses; the 112 MB counted every shader,
not what a combo loads): 4.0 s locally, 18.7 s at 50 Mbit/s, 72 s at 10 Mbit/s.

Done:

- **Framing**: defaults FOV 54, offsets 0.75 / −1 / 2 (were 59, 1.25 / 0.25 / 1.25): the hands about 1.15× bigger,
  both hands and the blade whole on 16:9; all in the game's ranges, so the embed can set them. Screens narrower than
  16:9 keep 16:9's horizontal angle (a phone held upright showed only the middle before). The app's saved viewmodel
  moved to `viewmodel-v4`. `C1-FRAMING-BEFORE-AFTER.png`.
- **WebP** (`pipeline/compress.mjs`, cwebp 1.6.0 from Google's release, in `C:\dev\tools`): albedos lossy (q 90),
  everything else near-lossless (packed channels: lossy WebP mixes them, PSNR 22–28 dB on normals); RGB under zero alpha
  kept (`-exact`); textures over 2048 halved (both compositors render at 2048: the 4096 glove AO was 21.9 MB). The
  viewer already loads `.webp` first. 82.4 → 44.2 MB; a render differs from PNG by 45 dB PSNR (noise floor 59 dB),
  not visible at 2× zoom (`c2-zoom-png-webp.png`).
- **sRGB storage**: packed layer families with sRGB layers and the composited glove albedo are `SRGB8_ALPHA8`
  (render 54 dB from before: only dark-tone precision changes; no banding was visible under Vertigo's light either way).
- **Agents in first person only**: agents' `glb` is `<model>.fp.glb` (only the `firstperson_*` meshes; Ricksaw 0.69 MB,
  was 3.33 MB), `body` stays the whole model for the agent view; the agents' body textures are built only with
  `"agentBodies": true` (the build went from 99 to 61 textures, 149 to 113 MB of PNG on disk).
- **Shaders**: each combo's info is the first line of its shader, not one table of all 1144 (`customweapon.json`
  1.57 MB → 44 KB, `customglove.json` 92 → 59 KB).
- **Background**: WebP in widths 960 to 3840 (37 to 327 KB; the JPEG is 960 KB), listed in the scene; the viewer loads
  the smallest that covers its canvas at the screen's pixel ratio (1280×720 at 1×: the 1280 one, 59 KB). The `.mp4`
  probe is skipped for maps with a still.
- **Environment**: the EXR rewritten as half-float RGB, ZIP (`pipeline/lib/exr.mjs`): 5.85 → 1.36 MB, 0.05% error.

After: **34.6 MB** in 81 requests (−58%): 4.0 s locally (unchanged: the rest is shader compiles and compositing on the
GPU, about 2.3 s after the last byte), **9.8 s at 50 Mbit/s** (was 18.7), **32 s at 10 Mbit/s** (was 72).

| One combo (cold cache) | Before | After |
| --- | --- | --- |
| Knife: Karambit model and textures | 9.2 MB | 4.7 MB |
| Finish: Doppler (Ruby), with the weapon-wide grunge and wear (5.6 + 2.5 MB, shared by every weapon finish) | 18.1 MB | 9.4 MB |
| Gloves: Specialist model and textures | 28.2 MB | 9.5 MB |
| Glove finish: Crimson Kimono | 8.5 MB | 5.2 MB |
| Agent arms: Ricksaw | 9.5 MB | 3.7 MB |
| Shaders | 1.7 MB | 0.15 MB |
| Background | 0.96 MB | 0.06 MB |
| Environment (reflections) | 5.9 MB | 1.4 MB |
| App code | 0.44 MB | 0.44 MB |

Left (C):

- The biggest files now: the weapon grunge (5.6 MB), the glove AO (5.0 MB, 2048) and normal (3.3 MB), the paint wear
  (2.5 MB), the arm normal (2.4 MB): data textures, near-lossless. cwebp skips near-lossless on some (the glove normal,
  the glove AO, `smoke2`: lossless size). Going further needs lossy data textures (checked per texture against renders)
  or GPU formats.
- A host's gzip saves about 2 MB more (the models and JSON: 3.6 → 1.5 MB); `.webp` and `.exr` are compressed already.
  For phase 3's hosting, with long cache lifetimes: the weapon grunge and wear, the gloves' textiles and the agent's
  arms are shared between combos.
- KTX2 / Basis (not done): smaller in GPU memory (phones), not in download; a phase 6 option. Meshopt compression of the
  models (the viewer has the decoder) would need gltfpack, a tool to approve.
- Four optional files still 404 per load (`firstperson/inspect/gloves_*.json`, `attack_index.json`, `agent_patches.json`).

### D: names, more finishes, the look (branch `phase-2d-names`)

Images in `C:\cs2-data\reference\compare\d*`.

Done:

- **Names.** The pipeline's names were right; the panel prefixed the item twice ("Specialist Gloves | Specialist
  Gloves | Crimson Kimono", cut off). The catalog's skin `name` is now the finish only, as the viewer reads it.
  Doppler and Gamma Doppler kits share one name in the game's text (no phase anywhere in `csgo_english.txt`); the
  build adds the market's phase from the kit name: "Doppler (Ruby)", "Doppler (Phase 2)", "Gamma Doppler (Emerald)".
  The agent field shows the default agent's name ("Lt. Commander Ricksaw | NSWC SEAL") instead of "Default CT Agent".
- **Newer (v2) gloves.** The 26 kits in `gloves/paints/volatile_02/` (22 in `items_game`, ids 1398–1440; all 72 older
  kits are classic). Their vcompmat names the paint as a loose resource-material variable
  (`items/assets/paintkits/volatile_02/<kit>.vmat`, a `csgo_customglove_preview` material) and starts every pass from
  `workshop/paintkits/templates/glove_compositor.vmat`; both are read, conditions with `m_bPassWhenTrue: false` are
  negated, and the 12 roll groups keep their conditions (`when`). Their compositor combo is 7 (3 without
  `F_TINT_ID`); its colour matrices call `TextureAverageColor`, the vtex Reflectivity, which `shader-dump` now reports
  per texture and the build writes as `texture_average.json` (only the v2 kits' textures). Combo 7 declared an array of
  arrays (GLSL ES 3.10); `convert-shaders.mjs` flattens them.
  - Rolls: the right hand (`seed_offset` 1) rolls each material offset and the pattern from `g_nRandomSeedAlt`, then
    burns 11 rolls (`consumable_random_numbers`) and rolls damage and grime. The "sync" groups test
    `instance_params.seed_offset`, which doesn't exist, so they never run (as in the game, presumably).
  - The flip: the vcompmat clears `g_bFlipFixup` on the hand whose material has the `left` attribute (Specialist: the
    right), now read from the model instead of assuming the left hand.
  - **Shared uniforms (from A):** combo 7's fragment shader declares none of the vertex stage's variables, so there was
    no clash for v2; combos 0 and 2 (classic) do (`g_vPatternTexCoordXform0/1`). The vertex stage now has its own
    uniforms (`vs_<name>`, `vsUniform`) in both paths. Crimson Kimono renders as before (59.4 dB against main: the
    noise floor).
  - Tested: **Specialist Gloves | Big Swell** (`glove_specialist_wave_blue`), seed 1, float 0.07, against the game's own
    item image (`panorama/images/econ/default_generated/specialist_gloves_glove_specialist_wave_blue_light_png`, the
    picture Steam shows; Steam's market rate-limited the page after three requests, so it was left alone):
    `d1-bigswell-solo.png`, `d1-bigswell-1.png`. The wave print, the cream "TORTUE" plates with gold bars, the blue suede
    fingertips and the dark knuckle panel match, at the same scale; the viewer's blues are a little more saturated.
    The icon's seed is unknown, so where the wave sits differs. Not checked against an in-game screenshot.
- **The 8 weapon combos at 17 textures** (gunsmith with case hardening, overlay, pearlescence, metalness and roughness
  textures, combos 4292–5741): `g_tPaintMetalness` and `g_tPaintRoughness` (both linear, one channel, same sampler and
  coordinates) share a 2-layer array (`packs` in the combo's info), packed at runtime like the glove families. All 1152
  weapon combos convert; the 8 compile and link with 16 samplers in Chrome. No built kit uses them yet. A combo without
  a shader still fails with "Composite combo N not exported".

- **The first frame sooner.** Measured with `C:\cs2-data\tools\firstframe.mjs` (`loadtime.mjs` plus a PNG screencast:
  "first visible" is the first frame where over 20% of the screen differs from the empty page), cold cache, production
  build on `vite preview`, the reference URL, no added latency (as in C). Results and frames in
  `C:\cs2-data\reference\compare\d4\`.
  - The background waited for the environment (the 1.3 MB EXR and its prefiltering): the first map's background now
    goes up as soon as it has loaded, without the veil. A thin progress bar (three.js' loading manager: files finished
    out of files started, never going back) shows along the bottom while the embed loads, with or without its UI.
  - The load ran in series (agent arms, glove shader, glove textures, glove model, knife textures, weapon shader, knife
    model). The arms, the gloves and the knife now load together, each model alongside its textures, the knife's
    composite alongside its finish, and the arm's skin textures with the gloves'.
  - Textures decode off the main thread (`ImageBitmapLoader`: no premultiplied alpha, no colour conversion, no flip) as
    they arrive, instead of on the main thread at the first frame; a knife's finish and its composite share each
    decode. Kimono renders as before (54 dB against main; the differences are under one level, over the models).
  - The four 404s are gone: `attack_index.json` and `agent_patches.json` are written empty, and the glove inspect clips
    are fetched only when `inspect_index.json` lists them.

  | Reference combo, cold cache | First visible, before | First visible, after | Loaded, before | Loaded, after |
  | --- | --- | --- | --- | --- |
  | Local (no throttling) | 0.8 s | 0.6 s | 4.6 s | 3.3 s |
  | 50 Mbit/s (home) | 1.1 s | 0.6 s | 11.8 s | 11.1 s |
  | 10 Mbit/s (slow mobile) | 4.0 s | 0.9 s | 35.1 s | 33.5 s |

  "Before" is this branch's build before these changes, measured on the same day with the same tool (part C's 9.8 s
  at 50 Mbit/s was another day; this machine measured 11.8 s today). Fully loaded is bound by the 34.6 MB: 28 s at
  10 Mbit/s for the bytes alone, and about 3 s after the last byte for decoding, shader compiles and compositing.
- **The look**: Combo Skin's green `#00DE12` (`oklch(0.781 0.263 142.8)`) as the primary colour and a `brand` palette
  around it (the components' violet accents), dark text on it, the violet-tinted darks made near neutral; Montserrat,
  the variable font as Google Fonts serves it (latin and latin-ext WOFF2, 109 KB), in `viewer/public/fonts/montserrat`
  with its licence. No package added; the Geist font package was removed.
- **Checks after the build**: `compress.mjs` (97 textures, 65.7 MB of WebP on disk). Big Swell from its WebPs against
  its PNGs: 46.1 dB (C: 45 dB for Kimono), no visible difference at 2× (`d6-zoom-png-webp.png`). A Big Swell combo
  downloads 33.1 MB.

Found, not changed:

- **A v2 glove combo takes about 11 s of GPU work locally** (Big Swell: loaded 12.3 s, network quiet after 1.0 s; the
  Kimono combo 3.4 s). Most likely the compile of combo 7's fragment shader (about 2,000 lines, with the tint-ID loops)
  under ANGLE. To look at: `KHR_parallel_shader_compile` (three's `compileAsync`), or splitting the output modes.
- **Steam's market** answered three requests from this machine with "too many requests"; the game's own item images
  (`panorama/images/econ/default_generated/`) are the same pictures and are in the copies.
- `build.mjs` re-extracts every texture on each run, so `compress.mjs` then re-encodes every one (it keeps a WebP only
  when it is newer than its PNG): fine for one combo (30 s), not for all of them.
- Doppler phases aren't in the game's text at all: "Doppler (Ruby)" is the market's name, built from the kit name.

Left (D):

- An in-game screenshot of a v2 glove (Big Swell, a known seed) to check its seed placement and colour.
- Building the glove inspect clips (`pedestal_gloves_*` are in the game) and the attack clips.

## Phase 3: parts

Phase 3 is coverage: every knife, glove and agent Combo Skin can show, built and checked, so the PC is only needed when
CS2 adds items. Two parts, one branch and pull request each: A builds and checks everything locally; B uploads it to
Cloudflare R2 and the viewer loads from there.

### A: build everything, locally (branch `phase-3a-coverage`)

Status: **done** (PR #7). Images and reports in `C:\cs2-data\reference\compare\p3\`.

- [x] Incremental build (below).
- [x] The build list from Combo Skin's catalog (below).
- [x] Full build and `compress.mjs`.
- [x] Automated check of every item and shader, contact sheets, coverage report (below).
- [x] Spot checks against the game's item images (below).
- [x] Hosting layout and totals in [`docs/asset-format.md`](asset-format.md#hosting-phase-3).
- [x] The v2 glove's slow first render: cause found, not fixed (below).

#### What to build: the catalog

`pipeline/items.json` pins the catalog (ByMykel/CSGO-API `public/api/en/skins.json` and `agents.json` at commit
`cbe5eec1854bf882bf1d79d8d5fd2aac7d80e5bc`); `node pipeline/fetch-catalog.mjs` fetches them once into
`C:\cs2-data\catalog\cbe5eec\` (outside git). `pipeline/lib/catalog.mjs` turns them into the build list: knives and gloves
by item definition index (`weapon.weapon_id`) and paint index (Doppler and Gamma Doppler phases have their own), agents
by item definition index (`def_index`), each resolved against `items_game`. Nothing is typed by hand; to follow the site,
change the pinned commit.

- Knives: 20 types, 576 finishes, of which 20 vanilla (no paint index: built as the `vanilla` finish, paint index 0, the
  model's own materials, the viewer's `bare` style; the viewer labels it "Vanilla").
- Gloves: 8 types, 94 finishes (72 classic, 22 newer).
- Agents: 63, every agent in the catalog. `items_game` has 141 `customplayer_*` items: the other 78 are all "Default T
  Agent" / "Default CT Agent" entries (map-based defaults on 16 models), which the site can't show; they're listed in the
  build report, not built.
- Every catalog entry resolves (no unknown item or paint index), and the game has no knife or glove finish with an item
  image (`panorama/images/econ/default_generated/<item>_<kit>_light_png`) that the catalog lacks: the two agree.
- Each knife's first-person clips are found from its model's folder (`weapons/models/knife/knife_m9/…` →
  `animation/anims/viewmodel/knife/knife_m9/idle1_m9`, `lookat01_m9`), so every knife has its idle and inspect.

#### Incremental build

- `shader-dump index` lists pak01 with each file's CRC32 (from the VPK's directory, 0.5 s for 137,844 files). The build
  reads it every run (`work/pak01_index.txt`, rewritten only when the copy changed).
- Every extraction job is cached in `work/cache/extract.json` under a key of the job, the source file's CRC32 (with the
  model's folder for models, the skeletons for clips) and a hash of the tool's binaries; a job whose key is unchanged and
  whose output exists isn't run. Every JSON and GLB is written only when its bytes change.
- `compress.mjs` keeps `work/compress/manifest.json` (each PNG's size, date, SHA-1, mode): a PNG with the same content is
  never re-encoded, even when extracted again.
- **How to tell what changed** after a CS2 update (recopy the VPKs first, see `C:\cs2-data\VERSION.md`), from
  `C:\cs2-data\extracted\work\`: `changes.json` (written by the last build that changed anything) has `source` (pak01
  files added, changed, removed by CRC since the previous build), `redone` (the files decoded again, and why: new,
  source changed, output missing) and `rewritten` (viewer files whose bytes changed); `compress/encoded.json` the
  textures the last compress re-encoded; `build-report.json` what was built, what failed and the catalog comparison.

| Run | build.mjs | compress.mjs |
| --- | --- | --- |
| Full (empty cache) | about 3 min (2 min 33 s for 1,149 files, after a subset build had decoded 325 in 27 s) | 3 min 47 s (856 textures, 1,344 MB PNG → 639 MB WebP) |
| Nothing changed | 3.5 s, nothing decoded or written | 0.2 s, nothing encoded or written |

A full build is about 7 minutes; the checks below take another 25.

#### Checks

`node pipeline\check.mjs` (the production build on `vite preview`, port 5321) loads every item in the embed in headless
Chrome on a transparent background and takes the embed's own screenshot (`cs3d:screenshot`). A finish passes when the
embed posts `cs3d:loaded`, nothing logs an error, exception or shader error, no asset request fails, and the render
isn't missing, black, white or flat. Knife and glove finishes are seen in the orbit view (seed 1, float 0.05); each knife
in first person (its idle, Specialist Gloves | Crimson Kimono); each agent's arms in first person (its own gloves, a
vanilla Karambit). `--shaders` compiles and links every compositing shader as the viewer would.

| Kind | Catalog | Built | Passed | Problems | Average load (warm cache) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Knife finishes (20 knives) | 576 | 576 | 576 | 0 | 1.0 s |
| Glove finishes (8 gloves) | 94 | 94 | 94 | 0 | 1.1 s |
| Agents (first-person arms) | 63 | 63 | 63 | 0 | 1.1 s |
| Knives in first person | 20 | 20 | 20 | 0 | 1.6 s |
| Compositing shaders | | 1,158 | 1,158 | 0 | |

Contact sheets (one per item type, PNG and HTML; `index.html` lists them) and `coverage.md` (built, failed and why, the
catalog against the game files) are in `C:\cs2-data\reference\compare\p3\`. Looked through: every knife sits in the
right hand in its own idle (Karambit and Talon reverse grip, the Shadow Daggers one per hand); each agent shows its own
sleeves and skin. Found and fixed on the way: the weapon composite fetched `texture_channels.json`, which no build
writes (a 404 on every knife), only to ignore it. The first shader run lost its WebGL context after an 8.8 s cold
compile and every later shader failed with an empty log; the check now takes a new context, and all 1,158 pass.

#### Spot checks against the game's item images

The game's own item images (`panorama/images/econ/default_generated/<item>_<kit>_light_png`, the pictures Steam shows,
and `econ/characters/<agent>_png`) come from the copies, so Steam wasn't needed. Side by sides are in
`C:\cs2-data\reference\compare\p3\spot\` (`spot-knives.png`, `spot-gloves.png`, `spot-agents.png`; the game on the left,
the viewer on the right, knives tilted and seen from the back as in the game's).

- **Knives**, one finish each, picked to cover many paint styles (Fade, Marble Fade, Tiger Tooth, Oiled, Urban Masked,
  Crimson Web, Ruby, Emerald, Doppler Phase 1 and 2 and the Talon's own Phase 1, Black Pearl, Scorched, Forest DDPAT,
  Night, Blued Steel, Forced, Ultraviolet, Boreal Forest, Safari Mesh): every one has the right pattern, colours and
  painted parts on the right model. What differs is light: the game's pictures use a bright, reflective rig, so the
  viewer's studio renders are darker and less saturated, metals most (Scorched on the Karambit is mostly dark where the
  game shows bright steel; Blued Steel and Forced are duller; Tiger Tooth is brownish orange against bright yellow).
  Where Oiled's pattern sits differs (the picture's seed is unknown).
- **Gloves**, one finish per type: all 8 have the right print on the right panels at the right scale (the hand wraps'
  camo, the motorcycle's stripe, the brocade crane, the Specialist "TORTUE" plates, the beadwork, the three studded
  gloves' emblems). Differs: **Sport Gloves | Beadwork** (a newer glove): the game's finger panels are pearlescent
  lilac, the viewer's dull grey-beige; likely the final glove material (cloth sheen or an iridescent layer) rather than
  the composite. To look at. Metals (studs, the Hydra's emblem) are duller, as with the knives.
- **Agents** (Ricksaw, Bloody Darryl The Strapped, B Squadron Officer, a Leet and a Guerrilla agent, the Diver): the
  game's pictures are third-person portraits, so only the sleeves can be compared. The SAS camo, Ricksaw's and the
  Guerrilla's bare forearms and Darryl's watch match; the Diver's wetsuit sleeve is near black in the viewer against
  blue grey in the picture (the light, or the material: to look at).

#### The v2 glove's slow first render

Measured with `C:\cs2-data\tools\glprof.mjs` (wraps WebGL's blocking calls in the page; a fresh Chrome profile, so no
cached programs): Big Swell loads in 12.3 s, Kimono in 3.2 s. **7.9 s of the difference is one call: linking the glove
compositor's combo 7 program** (a 92 KB fragment shader; Kimono's combo 0 is 37 KB and links in 0.3 s). The other
programs (the hands' and the knife's materials) take about twice as long in the Big Swell load, sharing the GPU process
with it. Alone and cold, combo 7 compiles in 4.5 s (`compiletime.mjs`): Direct3D's shader compiler under ANGLE (Chrome
and Edge on Windows). Chrome keeps compiled programs on disk, so a visitor pays it once.

Tried, no help: rewriting the decompiled `for (;;) { if (!(i < n)) break; … }` loops (the tint-ID sampling) as
canonical counted loops (4.5 s either way). With the output mode fixed as a constant, the albedo program alone still
takes 3.4 s and the normal one 1.3 s. Not simple, so nothing changed. Options, roughly by effort:

1. Compile combo 7 first and in the background: three.js' `compileAsync` (`KHR_parallel_shader_compile`), started as
   soon as the glove's kit is known, before its textures; the main thread stays free and the other programs compile
   alongside. Saves part of the contention (a few seconds), not the 4.5 s.
2. Specialise combo 7 per kit: a finish's feature flags and tint-ID settings are constants; turning the uniforms it
   doesn't vary into constants lets the compiler drop dead branches (each kit becomes its own program, so the disk
   cache helps less).
3. Find the expensive part by halving the shader (compile time against removed sections) and restructure that part.
4. Bake the newer gloves' composites at build time (four 2048 maps per finish and seed), at a cost in size and in the
   live seed.

Also seen: a cold 8.8 s compile (combo 5) lost the WebGL context in the shader check. If a visitor's GPU resets during a
long compile the viewer would have to recover from `webglcontextlost`; worth a test on a slow machine.

#### Where it stopped

Part A is complete (merged). Part B followed.

### B: hosting on Cloudflare R2 (branch `phase-3b-upload`)

Status: **done** (PR #8). Measurements in `C:\cs2-data\reference\compare\p3b\`.

- [x] rclone v1.75.2 in `C:\dev\tools` (checked against rclone.org's `SHA256SUMS` and its signature); the R2 token
  (Object Read & Write on `combo-skin-assets` only) and the rclone remote `combo-r2` made by hand, the config
  password-protected ([pipeline README: upload](../pipeline/README.md#upload)).
- [x] The publish step: `hosting.mjs` stages the bucket (`work\hosting\publish\`), the release's JSON rewritten to name
  game files by their `g/` keys; the release is a hash of the files as published (`3de0d6e58111`).
- [x] The viewer's hosted layout (`viewer/src/lib/asset-layout.ts`) and the pointer (below).
- [x] The upload (`pipeline\upload.mjs`): **2,402 files, 746,794,934 bytes** (the manifest's 2,401 and `release.json`),
  in 5 min; the bucket then held exactly the manifest (count, sizes, MD5s).
- [x] Headers, CORS, edge cache, cold loads from R2, every item checked from R2 (below).
- [x] The update command, and its run with nothing changed: nothing sent, 4 s.

#### How the viewer finds the release

A pointer, `https://assets.combo.skin/release.json` (`{"release":"3de0d6e58111"}`, `Cache-Control: public,
max-age=60`), read once when the viewer starts, rather than the release baked into the build: after a CS2 update the
upload alone moves every page to the new release within a minute, with no viewer deploy, and pages already open keep
theirs (old releases stay). It costs one small request before the catalog. A build can still pin one
(`VITE_ASSET_RELEASE=<release>`): for a viewer change that needs new data (deploy that viewer pinned, then upload, then
unpin), or for the screenshot worker, so a shot names the release it was taken with. The pointer is uploaded last, so it
never names a release whose files aren't all there. Details in [asset format: hosting](asset-format.md#hosting-phase-3).

Viewer changes: `VIEWER_DATA` and `GAME_ROOT` come from `asset-layout.ts` (a top-level await: every module that loads
assets waits for the release); the few places that matched model file names (the knife's own animation track, the
glove model's arm skeleton) compare game paths without the hash; the hard-coded `extracted/viewer/` paths go through
`VIEWER_DATA`; the map's sky loads its EXR first (it asked for a `.hdr` no build writes: a 404 on every load).

#### Checks

- **Bucket against the manifest**: 2,402 objects, 746,794,934 bytes, every key with the manifest's size and MD5
  (`upload.mjs` checks this after every upload).
- **Headers** (one file of each kind, `Origin: https://view.combo.skin`): all 200, `Content-Type` `image/webp`,
  `model/gltf-binary`, `image/x-exr`, `application/json`, `text/plain; charset=utf-8`; `Cache-Control: public,
  max-age=31536000, immutable` (`release.json`: `public, max-age=60`); `Access-Control-Allow-Origin` echoing the origin.
- **CORS**: `https://combo.skin`, `http://127.0.0.1:5321`, `http://localhost:5320` allowed; another origin gets no
  header; the preflight answers 204 with `GET, HEAD`. A missing key is a 404; TLS 1.1 is refused.
- **Edge cache** (`cf-cache-status`, each file fetched twice): `.webp` MISS then HIT (Cloudflare caches it by default);
  `.glb`, `.exr`, `.json`, `.glsl` and `release.json` DYNAMIC both times, not cached at the edge, at the time of the
  checks (2026-11-06): they need the cache rule for `assets.combo.skin` being added in the dashboard. Check again with
  two fetches of one file per kind; the second should say HIT (`release.json` HIT or EXPIRED). Until then those come
  from R2 on every request (still correct, a little slower; the browser caches them all the same).
- **Cold loads from R2** (the production build with `VITE_ASSET_BASE=https://assets.combo.skin` on `vite preview`,
  headless Chrome with a new profile and the cache disabled, `C:\cs2-data\tools\loadtime-r2.mjs`; the time the embed
  posts `cs3d:loaded`; no failed request, CORS error or console error in any):

  | Combo | Loaded | Network quiet | Downloaded | Requests |
  | --- | ---: | ---: | ---: | ---: |
  | Reference (Karambit \| Doppler (Ruby), Specialist \| Crimson Kimono, Ricksaw), first load after the upload (edge cold) | 5.4 s | 3.4 s | 33.8 MB | 70 |
  | Reference, edge warm (three runs) | 4.3–4.6 s | 1.8–1.9 s | 33.8 MB | 69 |
  | v2 glove (Specialist \| Big Swell, with the Ruby Karambit) | 18.5 s | 5.4 s | 32.2 MB | 75 |
  | Vanilla knife (Butterfly Knife, Specialist \| Crimson Kimono) | 4.1 s | 1.8 s | 32.6 MB | 64 |
  | Another agent (Bloody Darryl The Strapped, the agent's own gloves, the Ruby Karambit) | 2.8 s | 2.8 s | 27.5 MB | 49 |

  Part C measured the reference at 4.0 s from the local disk; from R2 on this connection the bytes are in within about
  2 s and the rest is the same shader compiles and compositing. The v2 glove is its slow compile (part A, above). The
  one request without a CORS header is the background, shown as a plain image, not a texture.
- **Every item from R2** (`node pipeline\check.mjs --out p3b --assets https://assets.combo.skin/`, the R2 build on
  `vite preview`): **all 753 pass** (576 knife finishes, 94 glove finishes, 20
  knives in first person, 63 agents; average warm loads 1.0, 1.9, 1.5 and 1.2 s), no failed request, CORS error or
  console error; the first-person sheet matches part A's. The local layout still passes too (`--out p3b-local`, the 20
  knives in first person and the Motorcycle Gloves, which have their own arm skeleton).

#### The update command

After a CS2 update: recopy the VPKs, then the build, `compress.mjs` and `hosting.mjs`, then
`node pipeline\upload.mjs --dry-run` and `node pipeline\upload.mjs` ([pipeline README: upload](../pipeline/README.md#upload)).
It lists the bucket (2 s), sends only the manifest's keys the bucket lacks (changed game files have a new hash, the new
release has a new folder), the pointer last, prints what it sent by folder and by header, and checks the bucket against
the manifest. Only `rclone copy` with `--immutable` (the pointer apart): nothing is deleted or replaced. Run with nothing
changed: `hosting.mjs` stages nothing, `upload.mjs` "to send: 0 files", "nothing to send: the bucket already has this
release", in 4 s. (Listing the bucket with dates took 3 minutes, a request per object: it lists without them.)

#### Left

- **Old releases and game files** stay in the bucket; nothing removes them yet. When there are a few releases: list the
  `g/` keys no kept release names and delete them with your approval (a separate step, not written).
- The agents' third-person bodies aren't hosted (63 models; the hosted viewer has no agent view). Host them if the agent
  view is wanted on the site.
- The weapon grunge and wear, the gloves' textiles and the agents' arms are shared between combos: a visitor's second
  combo with the same gloves or agent downloads only what differs (immutable caching).

#### Where it stopped

Part B is complete (merged). Phase 4 followed.

## Phase 4: the embed (branch `phase-4-embed`)

Status: **done** (PR #9). The contract is [embed.md](embed.md); checks and their data in
`C:\cs2-data\reference\compare\p4\` (tools: `C:\cs2-data\tools\embed-check.mjs`, `ff-handshake.mjs`).

- [x] Design agreed: `/combo` with items by index, the `cs3d:` protocol with ids, origins, headers, hosting on Pages.
- [x] The embed (`viewer/src/pages/combo-page.tsx`, `viewer/src/lib/embed/combo*.ts`, `origins.ts`, `webgl.ts`,
  `early-messages.ts`).
- [x] No WebGL2, context loss, the first frame.
- [x] `_headers` (CSP with frame-ancestors), sent by `vite preview` too.
- [x] The test host (`viewer/test/host/`), on 5322 (allowed) and 5323 (not).
- [x] Checks: message order, other origins, the handshake, context loss, memory over 20 switches, load times.
- [x] Docs: embed.md, architecture, this page, the API page.

#### What was built

- **`/combo`**: knife and gloves by item definition and paint index, an exact float and seed for each, the agent by its
  index (empty: Ricksaw), `view=fp|orbit`, `ui=0|1`. Checked against the catalog before anything loads: a missing or bad
  field, an unknown item, a finish that isn't built, a float outside the finish's range (more than 0.0001 out) each give
  `cs3d:error` with a code and a sentence, and no scene. The page is light (9 KB); three.js and the viewer are fetched
  only after the WebGL2 check (`combo-runner.ts`).
- **Messages**: `ready`, `progress`, `loaded`, `error`, `recovering`, `state`; commands `load`, `inspect`, `setView`,
  `getState` (and `loseContext` with `debug=1`), each with an `id` echoed by its events. Commands sent before the page
  has loaded are kept from the first module on (`early-messages.ts`): without that, the test host's command at the
  iframe's `load` event was lost.
- **Origins**: accepted from combo.skin, view.combo.skin, admin.combo.skin and local ports 5173, 4173, 5174, 5320,
  5321, 5322, from the parent window only; posted only to the parent's origin (`ancestorOrigins`, else the referrer,
  else the first allowed message). The older `/embed` (the pipeline's checks) now follows the same list; it used to
  accept any origin and reply to `'*'`.
- **Headers**: `frame-ancestors 'self' https://combo.skin https://admin.combo.skin http://localhost:* http://127.0.0.1:*`
  and a CSP for the rest (`'wasm-unsafe-eval'` was needed: three.js' meshopt decoder is WebAssembly), `nosniff`,
  referrer and permissions policies, immutable caching of `/assets/*`.
- **Context loss**: the view is thrown away (its context released with `forceContextLoss`), rebuilt on a new canvas and
  the combo loaded again; a second loss before it has loaded is reported (`context-lost`, retryable). `dispose()` now
  releases the context in the app too, so rebuilds don't pile contexts up (Chrome keeps about 16).
- **First frame**: `index.html` paints the page colour and an animated bar before any script; the map's background goes
  up as soon as the 3D code has loaded, next to the catalog's load.
- **A texture leak, fixed**: every switch of item left about 57 textures on the GPU (three.js' count grew from 72 to
  1,207 over 20 switches): the cleared models' materials and textures weren't freed, nor the composites' inputs (the
  weapon grunge and wear, paint textures) held in uniforms that three.js doesn't own, and the glove layers copied into
  texture arrays stayed uploaded. `lib/viewer/dispose.ts` frees a material with its textures (properties, uniforms, and
  uniforms added in `onBeforeCompile`, registered with `addedUniforms`); `packLayers` frees its layers. The app's
  viewer pages had the same leak.

#### Checks

All with the production build (`VITE_ASSET_BASE=https://assets.combo.skin`) on `vite preview` and the test host on
another origin; headless Chrome with a new profile.

- **Message order, every test combo** (`embed-check.mjs order`): by URL `ready progress… loaded` (reference 3.2 s,
  Big Swell 6.5 s, vanilla Butterfly 1.3 s, Darryl 1.3 s, warm cache), by message in the same iframe `progress…
  loaded` for each (0.6–1.4 s), `setView` orbit and back, `inspect`, `getState`, then six bad requests, each with the
  right code (`unknown-knife` for 9999, `bad-params` for a float of 0.5 on Ruby and for missing gloves,
  `unknown-agent` for 1, `unknown-gloves-finish` for a knife's paint index on gloves, `unknown-knife` for the gloves'
  index as the knife), and a good load after them. No CORS, CSP or console error and no failed request (the
  background still loads as a plain image without CORS, as in 3B).
- **Other origins** (`origin`): the host on 5323 frames the embed (allowed: local) and its URL combo draws, but its
  `cs3d:load`, `cs3d:loseContext` and `cs3d:getState` are ignored: no message back, no request for Big Swell's files,
  the context untouched.
- **Handshake** (`handshake`, `ff-handshake.mjs`): with `Referrer-Policy: no-referrer` and the combo sent by message,
  in Chrome and in Firefox 159 (headless, its own profile, over WebDriver BiDi): `→ load`, `← ready`, `progress`,
  `loaded`, no errors. Both browsers have `ancestorOrigins` and neither lets a script hide it, so the last fallback
  (the first message) was checked with a local build whose detection was turned off (not committed): `ready` came
  only after the host's message, then the combo loaded.
- **Context loss** (`lose`, with `WEBGL_lose_context`): lost while loading (after 15 files): `recovering`, then
  `progress… loaded`; lost after loading: rebuilt and loaded; lost twice in a row: `cs3d:error` `context-lost`
  (retryable), no live context left; the page's next `cs3d:load` loaded. One live context after each recovery.
- **Memory over 20 switches** in one iframe (`memory 20 nolose`; the four test combos in turn; after each, a forced
  garbage collection, then the JS heap, the GPU process's memory from Windows' `GPU Process Memory` counters, the live
  WebGL contexts and three.js' counts):

  | | Start (reference) | After 20 switches (reference) | Range over the 20 |
  | --- | ---: | ---: | ---: |
  | JS heap | 10.2 MB | 11.5 MB | 11.2–13.0 MB |
  | GPU process memory (shared; this PC's GPU reports no dedicated memory) | 2,107 MB | 2,401 MB | 1,801–2,585 MB, by combo, not rising |
  | Live WebGL contexts (made) | 1 (2, with the WebGL2 probe) | 1 (2) | 1 |
  | three.js textures / geometries / programs | 56 / 22 / 13 | 56 / 22 / 13 | the same four values per combo, every cycle |

  Before the leak fix the texture count went from 72 to 1,207. With a forced context loss every fourth switch
  (`memory 20`): one live context throughout (8 made). The reference's render after the 20 switches matches the first
  (`memory-start.png`, `memory-end.png`).
- **The pipeline's check** after the disposal changes, from R2: all 20 knives in first person, 94 glove finishes and 63 agents pass (`C:\cs2-data\reference\compare\p4-check\`).

#### Load times

The reference combo by URL in the test host's iframe, cold (a new profile, cache disabled), assets from R2
(`embed-check.mjs time`; "loaded" is `cs3d:loaded`'s `ms`, from the iframe's start; part C measured the same way,
without the iframe):

| Conditions | `cs3d:ready` (at the host) | First progress | Loaded | Downloaded |
| --- | ---: | ---: | ---: | ---: |
| This PC, no throttling (3 runs) | 0.18–0.26 s | 0.61–0.66 s | **2.9–3.0 s** | 33.8 MB, 63 requests |
| CPU 4× slower, no network limit (1 run) | 0.39 s | 0.93 s | 3.7 s | the same |
| **Weak device: CPU 4× slower and 10 Mbit/s** (2 runs) | 0.55–0.63 s | 1.4 s | **30.5 s** | the same |

Part C measured 4.0 s locally and 33.5 s at 10 Mbit/s, and 3B 4.3–4.6 s from R2: the iframe adds nothing measurable.
No errors in any run.

**Weak devices.** The throttled run is the network's: 33.8 MB at 10 Mbit/s is 27 s for the bytes alone, and Chrome's
CPU throttling doesn't slow the GPU, where the rest happens (shader compiles, the composites), so it says little about
a phone's GPU. A lighter mode for phones (not built) would need:

- Smaller textures: a second texture set at half size (1024; most are 2048 now), about a quarter of the bytes, chosen
  by the viewer from the screen size. The biggest files are data textures (the weapon grunge 5.6 MB, the glove AO and
  normal, the paint wear), so this is where most of the 33 MB is.
- Less GPU memory: GPU-compressed textures (KTX2 / Basis, phase 2C's note), composites at 1024 instead of 2048.
- Less to draw: pixel ratio 1, no antialiasing or bloom (the older embed's `quality=lite` does part of this), and the
  environment's reflections from a smaller EXR.
- The v2 gloves' compile (several seconds even here): specialise or precompute it (part A's options) before phones.
- A real phone to measure on: CPU throttling in Chrome is not one.


#### Hosting the viewer at view.combo.skin

Recommended: a **Cloudflare Pages project built from this repository** on every push to `main` (only reviewed, merged
code). The build needs nothing from the game: it never reads the asset folder (`public/assets` isn't copied), and the
assets come from R2. Steps, in the Cloudflare dashboard, by hand:

1. Workers & Pages → Create → Pages → Connect to Git. Install the Cloudflare GitHub app with access to **only this
   repository** (`shb327/cs2-combo-viewer`), not all repositories.
2. A project (for example `view-combo-skin`), production branch `main`, framework preset none, build command
   `npm ci && npm run build`, build output directory `dist`, root directory `viewer`.
3. Environment variables (production): `VITE_ASSET_BASE` = `https://assets.combo.skin`, `NODE_VERSION` = `24` (Vite 7
   needs 20.19 or later; this PC builds with Node 26). Nothing secret: the build reads no key.
4. Preview deployments off for other branches (Settings → Builds → branch control: production branch only); their
   `*.pages.dev` addresses aren't in the bucket's CORS, so they couldn't load assets anyway.
5. Custom domain `view.combo.skin` (Pages adds the DNS record in the combo.skin zone).
6. **Web Analytics off** for this project: its beacon would be blocked by the CSP; combo.skin counts 3D opens from
   `cs3d:loaded`.
7. After the first deploy:
   `https://view.combo.skin/combo?knife=507&knife_paint=415&knife_float=0.01&knife_seed=1&gloves=5034&gloves_paint=10033&gloves_float=0.15&gloves_seed=269`
   shows the reference combo, and the response has the `Content-Security-Policy` from `_headers`.

`_headers` is in the build's output (`dist/_headers`); Pages serves `index.html` for `/combo` (there's no `404.html`,
so it runs as a single-page app). The alternative, uploading with wrangler from a Mac, works the same but needs wrangler
installed and a deploy by hand after each merge.

#### Left

- A lighter mode for phones (see the estimate above): not built.
- The fallback for browsers without `ancestorOrigins` is checked only with a patched build: every browser tested has it.
- The Combo Skin side: the button, the iframe and the fallback to the screenshot (from [embed.md](embed.md)).

#### Where it stopped

Phase 4 is complete (merged). Phase 5 followed.

## Phase 5: the screenshot worker (branch `phase-5-worker`)

Status: **done, in review**. The worker is [`worker/`](../worker/README.md); the API's side is Combo Skin's spec 015
(`api/README.md`, "Screenshots"). Checks and PNGs in `C:\cs2-data\reference\compare\p5\` (`timings.json`).

- [x] Design agreed (2026-11-08): capture mode in `/combo`; Chrome over the DevTools protocol, no packages; the
  worker's own build pinned to a release on 127.0.0.1:5321; settings from the environment; once or polling; the Mac.
- [x] The embed: `capture=1`, `cs3d:captureReady`, `cs3d:capture` → `cs3d:captured`; seeds optional (default 0).
- [x] The worker: config, API client, loop, renderer, server, build; the PNG checks and text chunks.
- [x] Tests against a fake API that follows the contract (25), and the end-to-end run with Chrome and R2.
- [x] Docs: embed.md ("Capturing", seeds), worker/README.md (with the Mac), architecture, this page.
- [ ] The first run against the real API, on the Mac, after the merge (worker/README.md, "On the Mac"), and its timings.

#### What was built

- **Capture mode in `/combo`** (`capture=1`): the view fixed at 1920×1080 CSS pixels at pixel ratio 1 (no adaptive
  resolution), `ui=0`, the sway off and the pose held at the idle's time 0 (`SkinViewer.setStillTime`), the map's
  background fetched with CORS (`readableBackground`; only in this mode, so the site's pages are unchanged).
  `cs3d:captureReady` comes after `loaded`, once every file is in, the background is decoded, and two frames are drawn
  with that true. `cs3d:capture` composes the background (`object-fit: cover`, as CSS draws it) and the WebGL frame,
  drawn and read in the same task (`SkinViewer.captureCanvas`), and answers `cs3d:captured` with the PNG and
  `coverage`, the share of the frame the 3D view drew (0 would be a cleared frame; about 0.2 here).
- **Not framed**: an embed without a parent used to post nothing; it now dispatches its messages on its own window as
  `cs3d` DOM events (`origins.ts`). The worker injects a listener before the page's scripts and passes them out through
  a DevTools binding. The reply is `cs3d:captured`, not `cs3d:capture`, so it can't be read back as the command.
- **Seeds optional**: `knife_seed` and `gloves_seed` may be left out, drawn as 0 (`DEFAULT_SEED` in `combo.ts`). The
  API sends a null seed for a combo without seed conditions, and the site's View in 3D will send the same, so the
  screenshot and the 3D view agree.
- **The worker** (plain Node, no packages; Node 24): `src/config.mjs` (the environment; the token kept out of the
  config's fields), `api.mjs` (the worker routes; no `Origin` header; redirects refused, so the token can't follow
  one), `worker.mjs` (claim → render → check → upload; the failure table in its README), `renderer.mjs` and
  `chrome.mjs` (one Chrome, one page, the DevTools protocol over Node's `WebSocket`), `server.mjs` (the build with
  `_headers`' headers; port 5321 or a clear stop), `png.mjs` (chunks, `tEXt`, decode, blank check), `build.mjs` (the
  pinned build and `worker-build.json`: release, asset host, commit).
- **Choices made on the way**: a frame that is blank, transparent, the wrong size, or whose `coverage` is under 1% is
  never sent (`render_failed`); a timeout or a crash starts the next job in a fresh page; `assets-unavailable` and
  `context-lost` get one more try in a fresh page; `--once` gives up on an API that doesn't answer after three tries
  (polling keeps waiting for it).

#### Checks

On this PC (Intel UHD Graphics, Chrome with ANGLE on Direct3D 11), the build pinned to `3de0d6e58111`, assets from R2:

- **Tests** (`npm test`, 25): the PNG code; the settings (the token's form, https unless local, the timeout's range;
  the token never in the config's fields, an error or a log line); the job's mapping (null seeds and a vanilla knife's
  float left out); the client against the fake API (401, 403 with `Origin`, no `Origin` sent, claim and 204, the
  upload's 413 / 415 / 422s, a PNG with the text chunks stored as sent, 409 `claim_expired` / `inputs_changed`, 404
  `job_not_found`, fail and release with their reasons); the loop (a blank or transparent frame never sent; lost jobs
  logged without a report; a 415 reported as `render_failed` with the code; a stop releases the claim; no GPU releases
  it as `gpu_unavailable` and stops; a revoked token stops with exit 2; an API that is down ends `--once`; polling
  picks up a combo that becomes due); the server (port in use, headers, paths kept inside the build).
- **End to end** (`npm run e2e`): every capture is 1920×1080, not blank, and **identical to Chrome's own screenshot of
  the page** (mean difference 0.000); warm shots are identical to the cold one. Then `node src/main.mjs --once` against
  the fake API: exit 0, five stored, each with its text chunks and identical to the captures, the token nowhere in the
  output. The combo without seeds equals the reference drawn with both seeds 0 (and differs from seeds 1 / 269 in 2.6%
  of its pixels, so the check means something).
- **Port 5321 taken**: the worker stops with exit 3 and a message naming the port. No Chrome was left running after any
  run.

#### Timings

Per combo, from `cs3d:load` to the PNG in the worker. Cold: a new browser with a new profile (no HTTP or shader cache).
Warm: the same browser, after another combo, three shots. The browser starts in 0.5 s.

| Combo | Cold | Warm | In the worker's queue run (one fresh browser, in this order) |
| --- | ---: | ---: | ---: |
| Reference (Ruby Karambit, Crimson Kimono, Ricksaw) | 4.6–5.5 s | 2.8–2.9 s | 5.0 s (first) |
| Big Swell (v2 glove) | 13.5–13.8 s | 3.5–4.1 s | 15.3 s |
| Vanilla Butterfly Knife | 4.1 s | 2.5–3.1 s | 3.8 s |
| Bloody Darryl The Strapped | 4.7–4.9 s | 2.8–2.9 s | 3.7 s |
| Reference without seeds | | | 3.0 s |

The queue run of five took 32 s, browser start included. A warm shot is slower than phase 4's 0.6–1.4 s switch
because it also waits for the still frames and encodes and moves a 2.4 MB PNG; the split isn't measured. Big Swell's
cold shot is its shader compile (phase 3A); the profile keeps the compiled program, so it's paid once per machine and
release.

#### Where to run it

The Mac (agreed): the API is there (no token on the network, nothing exposed), and Apple's GPU draws through Metal,
where the v2 glove's compile may be shorter than Direct3D's here. Its timings come from the first run there. A server
without a GPU would draw with SwiftShader: much slower, and not tested.

#### Where it stopped

Built, tested here, in review. Next: merge, then the first run on the Mac against the real API (worker/README.md, "On
the Mac"), and its timings in this section.

## Phase 6 notes (from phase 5)

- **Measure on the Mac**: cold and warm per combo, and whether Metal compiles the v2 glove's combo 7 faster.
- **A warm shot's 2.8 s**: split it (load, still frames, `toBlob`, the transfer) before optimising; the PNG encode of
  1920×1080 is likely a large part. A queue of thousands at 3 s is a few hours, fine for now.
- **Ctrl+C on Windows** wasn't tried (Node can't send a child process SIGINT on Windows); the stop path is covered by
  the tests and will be seen on the Mac.
- **The site's View in 3D** must leave seeds out exactly as the job does (null → left out), or the 3D view and the
  screenshot differ.
- **RENDER_REVISION**: the worker has its own (1, `src/main.mjs`) and warns when a job's differs. Raise both when the
  viewer changes how combos look.

## Phase 5 notes (from phase 4)

What the screenshot worker needs from the embed (not built yet):

- **A fixed frame**: 1920×1080 with `ui=0`, pixel ratio 1 and no adaptive resolution, so every shot has the same size
  and framing: a parameter (for example `frame=1920x1080`) that fixes the canvas instead of following the window.
- **A "ready to capture" event**: `cs3d:loaded` comes when the combo is drawn, but a shot needs a frame known to be
  final: every texture uploaded, the composites rendered, the background in, the idle animation at a fixed time (or
  paused) and the hands' sway off (the older embed's `viewmodel_sway`; not in `/combo` yet). Proposal:
  `cs3d:captureReady { id, release }` after two drawn frames with nothing loading, and a command
  `cs3d:capture { id, width, height, format }` answered with the image (as `/embed`'s `cs3d:screenshot` does), so the
  worker doesn't depend on the browser's own screenshot.
- **A pinned release**: the worker's build with `VITE_ASSET_RELEASE`, so a shot names the data it was taken with
  (`release` is in `ready` and `loaded` already).
- **Context loss**: a lost context during a shot should end in a retry in a fresh page (the embed rebuilds once, then
  reports `context-lost`).
- **Its origin**: if the worker frames the embed from a page of its own, that origin goes on the list in `origins.ts`
  and in `frame-ancestors`; a worker that opens `/combo` itself, not framed, needs neither.
- The v2 gloves' first compile (several seconds, part A) dominates a cold shot: keep one browser and profile warm
  between shots (Chrome's shader cache on disk).

## Phase 4 notes (from phase 3)

- **The viewer's address**: CORS on the bucket allows `https://view.combo.skin` and `https://combo.skin` (and the local
  dev and preview ports). Build the deployed viewer with `VITE_ASSET_BASE=https://assets.combo.skin`; it then follows
  `release.json`. The embed could report its release in `cs3d:ready`, so a page (and a screenshot) knows which data it
  showed.
- **WebGL context loss**: part A's shader check lost its WebGL context after an 8.8 s cold compile (weapon combo 5), and
  every later compile failed with an empty log until a new context was made; the v2 glove's combo 7 takes 4.5 s cold on
  this PC, longer on slower GPUs. The embed and the screenshot worker must recover from it: listen for
  `webglcontextlost` on the canvas (call `preventDefault()` so the browser may restore it), drop the GPU resources, and
  on `webglcontextrestored` (or with a new renderer, if it doesn't come) rebuild the materials and reload the current
  combo; post an event (for example `cs3d:error` with a reason) so the host page can show the combo's screenshot
  instead. The screenshot worker should retry a shot whose context was lost in a fresh page. To test: a slow machine,
  or `WEBGL_lose_context`'s `loseContext()` from the console.
- **First load**: about 33 MB per combo from R2, 4 to 5 s on this PC and connection (part C: 9.8 s at 50 Mbit/s,
  32 s at 10 Mbit/s); later combos with the same gloves or agent fetch only what differs. A page should load 3D only
  when asked, as planned.
- **Edge caching** of `.json`, `.glsl`, `.glb` and `.exr` depends on the cache rule for `assets.combo.skin` (Cloudflare
  caches `.webp` by default, not those): see part B's checks.

## Phase 3 notes (from phase 2)

- **Size of everything** (rough, from the copies' file list, not built): 20 knives, 94 glove finishes (72 classic, 22
  newer), 141 agents, 1481 paint kits in `items_game` (the knives' share of them to be counted). The texture folders
  the finishes draw from hold about 2,500 to 3,500 textures; at this build's average (0.68 MB of WebP per texture, PNG
  about twice that) that is **roughly 2 GB of WebP** to host, plus about 1 GB of models and data. Shared files (weapon
  grunge and wear, glove textiles, agents' arms) are counted once.
- **Build time** (rough): extraction about 0.15 s per texture and compression about 0.3 s per texture on this PC:
  **25 to 30 minutes** for everything, if the build stops re-extracting textures it already has (see above); the
  shaders are already all built (about 6 s).
- Each combo still loads its own 30 to 35 MB; long cache lifetimes on the shared files matter more than the total.

## Phase 2 needs (from phase 1)

- **Side-by-side check with the game**: reference screenshots of the combo from the game, taken by you; fix what differs (wear at several floats, pattern seeds, lighting, colour).
- Inspect and knife animation, forearm twist constraints: done in part B.
- **Vertigo**: its `scenes.json` (cameras, lights, light probe, post) and HDR from `de_vertigo_vanity.vpk`, and a way to produce the background video (render it in the viewer from the map's geometry and lightmaps, or another approach to decide).
- Textures as WebP and only what first person needs: done in part C.
- **Newer (v2) gloves** in the build (their compositor data and roll groups), and the 8 skipped weapon combos: done in part D.
- sRGB layer arrays stored as sRGB: done in part C.

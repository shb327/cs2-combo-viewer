# Roadmap

Each phase ends with something that runs. Later phases are rough and will change.

| Phase | Result | Status |
| --- | --- | --- |
| 0. Research | How existing viewers work and where the data lives ([landscape](landscape.md), [how it works](how-it-works.md)) | Done |
| 1. Pipeline spike | Our own pipeline feeding the ChainSkins-based viewer: Karambit \| Doppler (Ruby) in Specialist Gloves \| Crimson Kimono, first person, Terrorist arms | Done |
| 2. One combo, right | The phase 1 combo matching the game side by side, with the inspect animation, on Vertigo. In parts A to D (below), one branch and pull request each | A, B, C done; D in review |
| 3. Coverage | Every knife and glove finish; the full asset pipeline; hosting | |
| 4. Embed API | The viewer in an iframe, driven by `postMessage`, used from a Combo Skin test page | |
| 5. Screenshots | Headless rendering of a combo to images (Ricksaw on Vertigo, or the combo's own agent) | |
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
- Per load: the embed's `loadout_agent=<id>` URL parameter, or `loadout_agent` in the options of `cs3d:load` /
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
Cloudflare R2 (after the bucket exists).

### A: build everything, locally (branch `phase-3a-coverage`)

Status: **in progress** (this list is kept current so a new session can pick up).

- [x] Incremental build (below).
- [x] The build list from Combo Skin's catalog (below).
- [x] Full build and `compress.mjs`.
- [ ] Automated check of every item, contact sheets, coverage report.
- [ ] Spot checks against the game's item images.
- [ ] Hosting layout and totals in `docs/asset-format.md`.
- [ ] The v2 glove's slow first render.

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
| Full (empty cache) | 2 min 33 s (1,149 files decoded) | 3 min 47 s (856 textures, 1,344 MB PNG → 639 MB WebP) |
| Nothing changed | 3.5 s, nothing decoded or written | 0.2 s, nothing encoded or written |

#### Where it stopped

(Kept current.) Built: everything in the catalog, compressed. Next: the check run (`node pipeline\check.mjs`, needs
`vite preview` on port 5321), then the spot checks.

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

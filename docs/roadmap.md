# Roadmap

Each phase ends with something that runs. Later phases are rough and will change.

| Phase | Result | Status |
| --- | --- | --- |
| 0. Research | How existing viewers work and where the data lives ([landscape](landscape.md), [how it works](how-it-works.md)) | Done |
| 1. Pipeline spike | Our own pipeline feeding the ChainSkins-based viewer: Karambit \| Doppler (Ruby) in Specialist Gloves \| Crimson Kimono, first person, Terrorist arms | Done |
| 2. One combo, right | The phase 1 combo matching the game side by side, with the inspect animation, on Vertigo. In parts A to D (below), one branch and pull request each | A done; B in review (PR #3) |
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

### C: smaller downloads

- WebP (or KTX2) textures: about 112 MB per combo today as PNG; an encoder is a tool to approve first.
- Only what first person needs (the build also extracts the third-person body's textures). Ricksaw's first-person
  textures are 19.4 MB, his model 3.2 MB (the Default T Agent stays in the build as a choice: 31.8 MB, 1.9 MB).
- sRGB layer arrays stored as sRGB (`SRGB8_ALPHA8`) and the composited albedo too, instead of 8-bit linear.
- The background as WebP or AVIF (the screenshot is a 960 KB JPEG).

### D: names, more finishes, the look

- Real item names instead of the stand-in ("Specialist Gloves | Specialist Gloves" in the panel).
- The newer (v2) glove finishes in the build (their compositor data and roll groups), and the shared-uniform check above.
- The 8 skipped weapon shader combos (17 textures).
- Combo Skin's look: green `#00DE12`, Montserrat.

## Phase 2 needs (from phase 1)

- **Side-by-side check with the game**: reference screenshots of the combo from the game, taken by you; fix what differs (wear at several floats, pattern seeds, lighting, colour).
- Inspect and knife animation, forearm twist constraints: done in part B.
- **Vertigo**: its `scenes.json` (cameras, lights, light probe, post) and HDR from `de_vertigo_vanity.vpk`, and a way to produce the background video (render it in the viewer from the map's geometry and lightmaps, or another approach to decide).
- **Textures as WebP** (needs an encoder; a tool to approve), and only the textures first person needs (the build also extracts the third-person body's).
- **Newer (v2) gloves** in the build (their compositor data and roll groups), and the 8 skipped weapon combos.
- sRGB layer arrays stored as sRGB (now packed as 8-bit linear, losing precision in dark tones).

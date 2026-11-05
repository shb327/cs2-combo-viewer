# Roadmap

Each phase ends with something that runs. Later phases are rough and will change.

| Phase | Result | Status |
| --- | --- | --- |
| 0. Research | How existing viewers work and where the data lives ([landscape](landscape.md), [how it works](how-it-works.md)) | Done |
| 1. Pipeline spike | Our own pipeline feeding the ChainSkins-based viewer: Karambit \| Doppler (Ruby) in Specialist Gloves \| Crimson Kimono, first person, Terrorist arms | Done |
| 2. One combo, right | The phase 1 combo matching the game side by side, with the inspect animation, on Vertigo. In parts A to D (below), one branch and pull request each | In progress: A |
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

## Phase 2: parts

Phase 2 is split into parts, one branch and one pull request each. Every check uses Specialist Gloves | Crimson Kimono at
pattern seed 269 holding Karambit | Doppler (Ruby), Terrorist agent, against reference screenshots taken in game. The
screenshots live in `C:\cs2-dataeference` (never in git): `kimono-seed269.jpg` (1280×676, the reference, taken on another
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
- The arms' skin: the Default T Agent (Phoenix) uses `bare_arm_133` (light); the reference has dark arms (another T
  variant on that map).
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

Tools (outside git, `C:\cs2-data	ools`): `shot.mjs` (headless Chrome screenshot of the dev server over the DevTools
protocol, `EVAL`/`SAVE` to run code and save data URLs), `compose.mjs` (crops, side by side or as 50% overlays). The
reference URL: `/embed?skin=weapon_knife_karambit%7Cam_ruby_marbleized&view=fpv&loadout_gloves=specialist_gloves%7Cspecialist_kimono_diamonds_red&loadout_gloves_seed=269&loadout_gloves_float=0.15&loadout_agent=customplayer_t_map_based&ui=0&viewmodel_sway=0`.

### B: the knife in the hand and the inspect (next)

- The knife's own skeleton and bind (`weapon_skeletons.json`, `weapon_binds.json`) and its track in the clips, so the
  knife sits exactly in the hand and the inspect (`lookat01_karambit`) plays.
- Forearm twist constraints from the agent model, so the wrists twist like the game (the left wrist in the reference).
- Check against an inspect screenshot or video from the game.

### C: smaller downloads

- WebP (or KTX2) textures: about 112 MB per combo today as PNG; an encoder is a tool to approve first.
- Only what first person needs (the build also extracts the third-person body's textures).
- sRGB layer arrays stored as sRGB (`SRGB8_ALPHA8`) and the composited albedo too, instead of 8-bit linear.
- The background as WebP or AVIF (the screenshot is a 960 KB JPEG).

### D: names, more finishes, the look

- Real item names instead of the stand-in ("Specialist Gloves | Specialist Gloves" in the panel).
- The newer (v2) glove finishes in the build (their compositor data and roll groups), and the shared-uniform check above.
- The 8 skipped weapon shader combos (17 textures).
- Combo Skin's look: green `#00DE12`, Montserrat.

## Phase 2 needs (from phase 1)

- **Side-by-side check with the game**: reference screenshots of the combo from the game, taken by you; fix what differs (wear at several floats, pattern seeds, lighting, colour).
- **Inspect and knife animation**: the knife's own skeleton and bind (`weapon_skeletons.json`, `weapon_binds.json`) and its track in the clips, so the inspect plays and the knife sits exactly in the hand.
- **Forearm twist constraints** from the agent model, so wrists twist like the game.
- **Vertigo**: its `scenes.json` (cameras, lights, light probe, post) and HDR from `de_vertigo_vanity.vpk`, and a way to produce the background video (render it in the viewer from the map's geometry and lightmaps, or another approach to decide).
- **Textures as WebP** (needs an encoder; a tool to approve), and only the textures first person needs (the build also extracts the third-person body's).
- **Newer (v2) gloves** in the build (their compositor data and roll groups), and the 8 skipped weapon combos.
- sRGB layer arrays stored as sRGB (now packed as 8-bit linear, losing precision in dark tones).

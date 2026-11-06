# Asset pipeline

Builds the viewer's data from copies of the CS2 game files. See [docs/asset-format.md](../docs/asset-format.md) for what it produces.

- Reads **only** the copies in `C:\cs2-data\source` (never the game install), your own screenshots in `C:\cs2-data\reference`, and Combo Skin's catalog in `C:\cs2-data\catalog`. Paths outside them are refused.
- Writes **only** under `C:\cs2-data\extracted` (also: the catalog, once, by `fetch-catalog.mjs`; the check's sheets and report in `C:\cs2-data\reference\compare\p3`). Paths outside them are refused.
- Nothing it writes goes into git: models, textures and shaders are the game's, and the converted shaders are derived from Valve's.

## Pieces

| | What it does |
| --- | --- |
| `shader-dump/` | C# tool on the [ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat) library. `shader-dump --vpk … --shader …` writes a compositing shader's parameter table and the GLSL of each static combo; `shader-dump extract` decodes models (GLB plus skeleton and draw calls), materials, KV3 files, textures, animation clips and map entity lumps into exact paths, from pak01 or a map's vanity VPK; `shader-dump list` lists a VPK, `shader-dump index` with each file's CRC32. It opens only the VPK it's given (no game folder lookup). |
| `convert-shaders.mjs` | Turns the dumped Vulkan GLSL into WebGL2 fragment shaders and tables for the viewer. |
| `fetch-catalog.mjs` | Fetches Combo Skin's catalog (the files `items.json` pins: ByMykel/CSGO-API at one commit) from GitHub, once. |
| `build.mjs` | For every knife, glove and agent in the catalog (`lib/catalog.mjs`): extracts what they need and writes the viewer's JSON (catalog, items, kits, agents, first person). Incremental (below). |
| `build-maps.mjs` | For the maps in `items.json`: the background (your screenshot, as WebP in five widths), the environment (half-float EXR), and the sun and sky light from the map's vanity VPK (`maps.json`, `scenes.json`). |
| `compress.mjs` | A WebP next to every extracted PNG (the viewer loads it first): albedos lossy, everything else near-lossless, over 2048 halved. Only PNGs whose content changed are encoded. |
| `check.mjs` | Loads every built finish and agent in the viewer (headless Chrome), compiles every compositing shader, and writes contact sheets and a coverage report. |
| `hosting.mjs` | The files hosting needs, with their content-hashed names, and the totals (`docs/asset-format.md`, "Hosting"); stages the bucket's layout (`lib/publish.mjs`: the release's JSON rewritten to name game files by their keys, and the pointer). |
| `upload.mjs` | Sends the staged bucket to Cloudflare R2 with rclone: only what the bucket doesn't have, game files first, the pointer last; never deletes or replaces (below, "Upload"). |
| `rclone-password.ps1` | Hands rclone its config password from a file only your Windows user can decrypt, so uploads run without typing it. |
| `items.json` | The pinned catalog (what to build) and the maps. |
| `lib/` | Paths and their guards, the C# tool runner, a KeyValues parser. |

## Setup (once)

1. Copies of the game files in `C:\cs2-data\source\game\...` (`csgo\pak01_*.vpk`, `csgo\shaders_vulkan_*.vpk`, `core\shaders_vulkan_*.vpk`, `csgo\maps\*_vanity.vpk`). See `C:\cs2-data\VERSION.md` for the game version they come from; recopy after a CS2 update.
2. Node.js (LTS).
3. The .NET 10 SDK, portable, in `C:\dev\tools\dotnet-sdk-10` (the official zip from Microsoft, checked against its SHA-512).
4. The ValveResourceFormat 20.1 package from its [official release](https://github.com/ValveResourceFormat/ValveResourceFormat/releases/tag/20.1), saved as `C:\dev\tools\vrf-feed\ValveResourceFormat.20.1.7467.nupkg` (`nuget.config` uses that folder; the other packages come from nuget.org).
5. cwebp 1.6.0, Google's libwebp release for Windows (`libwebp-1.6.0-windows-x64.zip` from
   `storage.googleapis.com/downloads.webmproject.org/releases/webp`, checked against its `.asc` signature: key
   `6B0E6B70976DE303EDF2F601F9C3D6BDB8232B5D`, "WebP release signing key"), unzipped in `C:\dev\tools` (`CWEBP`
   overrides the path).
6. Build the tool (PowerShell). The cache and the build output stay under `C:\dev\tools`:

   ```powershell
   $env:DOTNET_ROOT='C:\dev\tools\dotnet-sdk-10'; $env:DOTNET_CLI_HOME='C:\dev\tools\dotnet-home'
   $env:NUGET_PACKAGES='C:\dev\tools\nuget-packages'; $env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
   & C:\dev\tools\dotnet-sdk-10\dotnet.exe build pipeline\shader-dump -c Release -o C:\dev\tools\shader-dump -p:BaseIntermediateOutputPath=C:\dev\tools\shader-dump-obj\
   ```

## Run

From the repository root, PowerShell:

```powershell
$env:DOTNET_ROOT='C:\dev\tools\dotnet-sdk-10'; $env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
# 1. The compositing shaders (about 6 s)
foreach ($s in 'csgo_customweapon','csgo_customglove') {
  & C:\dev\tools\shader-dump\shader-dump.exe --vpk C:\cs2-data\source\game\csgo\shaders_vulkan_dir.vpk --shader $s --out C:\cs2-data\extracted\shaders-raw
}
node pipeline\convert-shaders.mjs
# 2. The catalog (once per pinned commit) and the items (2.5 min the first time; 4 s when nothing changed)
node pipeline\fetch-catalog.mjs
node pipeline\build.mjs
# 3. The maps (a few seconds)
node pipeline\build-maps.mjs
# 4. The textures as WebP (4 min the first time; under a second when nothing changed)
node pipeline\compress.mjs
# 5. The checks (needs the viewer's production build on vite preview, port 5321) and the hosting list
node pipeline\check.mjs; node pipeline\check.mjs --shaders
node pipeline\hosting.mjs
# 6. The upload to R2 (below): only what's new, then the new release
node pipeline\upload.mjs --dry-run
node pipeline\upload.mjs
```

The build is incremental: extraction is cached by each source file's CRC32 (from pak01's directory) and every output
is written only when its bytes change, so after a CS2 update (recopy the VPKs first) it decodes only what changed.
`work\changes.json` says what changed in the copies and what was redone, `work\build-report.json` what was built and
what failed, `work\compress\encoded.json` which textures were re-encoded. `build.mjs --only <item>,…` builds a subset
(its index then lists only that subset: run the full build after).

Then start the viewer (`cd viewer; npm.cmd run dev`, or `npm.cmd run build; npm.cmd run preview` for the production
build on port 5321) and open, for example:

```
http://127.0.0.1:5320/skin/weapon_knife_karambit/am_ruby_marbleized?fp=1&fpg=specialist_gloves%7Cspecialist_kimono_diamonds_red
```

`CS2_SOURCE`, `CS2_EXTRACTED`, `CS2_REFERENCE`, `SHADER_DUMP` and `CWEBP` override the default folders and the tools'
paths. Only the agents' first-person meshes and textures are built; `"agentBodies": true` in `items.json` adds their
bodies' textures (for the third-person agent view, which loads the whole model).

## Upload

The assets are served from the R2 bucket `combo-skin-assets` at `https://assets.combo.skin` (layout and headers in
[docs/asset-format.md](../docs/asset-format.md#hosting-phase-3)).

**After a CS2 update**, once the copies are fresh: the build, `compress.mjs` and `hosting.mjs` as above, then

```powershell
node pipeline\upload.mjs --dry-run   # what it would send: counts and sizes by folder and by header
node pipeline\upload.mjs             # sends it, then checks the bucket against the manifest
```

It lists the bucket and sends only the manifest's keys the bucket doesn't have: changed game files (a new hash in the
name), the new release folder, then `release.json`, which switches every page to the new release within a minute (its
cache lifetime). With nothing changed the release is the same and it sends nothing. It prints what it sent and keeps a
record in `C:\cs2-data\extracted\work\hosting\uploads\`. It only runs `rclone copy`, with `--immutable` for everything
but the pointer: nothing is deleted, and a key already there with other bytes stops it. Old releases and game files
stay in the bucket; removing them is a separate, deliberate step (not written).

Each file goes up with `Cache-Control: public, max-age=31536000, immutable` (the pointer: `public, max-age=60`) and the
content type of its extension (`lib/publish.mjs`; an unknown extension stops `hosting.mjs`).

**Setup (once)**: rclone v1.75.2 for Windows from `downloads.rclone.org` (`rclone-v1.75.2-windows-amd64.zip`, checked
against `SHA256SUMS` and its signature: key `FBF737ECE9F8AB18604BD2AC93935E02FF3B54FA`), unzipped in `C:\dev\tools`
(`RCLONE` overrides the path). Then, by hand: an R2 API token with Object Read & Write on `combo-skin-assets` only;
`rclone config` with a remote `combo-r2` (`RCLONE_REMOTE`), type `s3`, provider `Cloudflare`, the token's access key and
secret, region `auto`, the account's S3 endpoint; `rclone config update combo-r2 no_check_bucket true` (a bucket-scoped
token can't check or create buckets); a config password (`rclone config`, `s`); and the password stored for unattended
runs:

```powershell
Read-Host -AsSecureString 'rclone config password' | ConvertFrom-SecureString | Set-Content -Encoding ascii C:\dev\tools\rclone-pass.dpapi
```

The key, the secret and the endpoint stay in rclone's config, never in this repository; `upload.mjs` hides 32-digit
hex strings (the account ID) in anything it prints from rclone.

## Output

```
C:\cs2-data\extracted\
  shaders-raw\              the game's shaders as dumped (Vulkan GLSL, tables)
  work\                     intermediate files: material and KV3 dumps, items_game, localization, job reports, sizes.json
  web\extracted\game\       models and textures at their game paths (textures as PNG and WebP, agents also <model>.fp.glb)
  web\extracted\viewer\     the viewer's JSON and converted shaders
```

`web\` is what the viewer's dev server serves at `/assets/`.

## Adding items

New knives, gloves and agents come from the catalog: pin a newer commit in `items.json` (`catalog.commit`), then run `fetch-catalog.mjs` and the build. A knife's first-person clips are found from its model's folder (`idle1_<x>`, `lookat01_<x>`). Classic and newer (v2, `gloves/paints/volatile_02/`) glove paints are both built; the v2 ones also write `texture_average.json` (each of their textures' Reflectivity, which `shader-dump extract` reports per texture).

A map needs its vanity VPK in the copies and a screenshot of the map taken in game with no hands, weapon or HUD, saved in `C:\cs2-data\reference`. In `items.json`: `"maps": { "<id>": { "name": "…", "background": "C:/cs2-data/reference/<file>.jpg", "viewYaw": -30 } }`. The screenshot's own direction isn't known, so `viewYaw` turns the eye from the direction the sun's light travels (degrees, left positive), which sets where the sun lights the hands from.

# Asset pipeline

Builds the viewer's data from copies of the CS2 game files. See [docs/asset-format.md](../docs/asset-format.md) for what it produces.

- Reads **only** the copies in `C:\cs2-data\source` (never the game install), and your own screenshots in `C:\cs2-data\reference`. Paths outside them are refused.
- Writes **only** under `C:\cs2-data\extracted`. Paths outside it are refused.
- Nothing it writes goes into git: models, textures and shaders are the game's, and the converted shaders are derived from Valve's.

## Pieces

| | What it does |
| --- | --- |
| `shader-dump/` | C# tool on the [ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat) library. `shader-dump --vpk … --shader …` writes a compositing shader's parameter table and the GLSL of each static combo; `shader-dump extract` decodes models (GLB plus skeleton and draw calls), materials, KV3 files, textures, animation clips and map entity lumps into exact paths, from pak01 or a map's vanity VPK; `shader-dump list` lists a VPK. It opens only the VPK it's given (no game folder lookup). |
| `convert-shaders.mjs` | Turns the dumped Vulkan GLSL into WebGL2 fragment shaders and tables for the viewer. |
| `build.mjs` | For the items in `items.json`: extracts what they need and writes the viewer's JSON (catalog, items, kits, agents, first person). |
| `build-maps.mjs` | For the maps in `items.json`: the background (your screenshot), the environment, and the sun and sky light from the map's vanity VPK (`maps.json`, `scenes.json`). |
| `items.json` | Which knives, gloves, kits, agents and maps to build. |
| `lib/` | Paths and their guards, the C# tool runner, a KeyValues parser. |

## Setup (once)

1. Copies of the game files in `C:\cs2-data\source\game\...` (`csgo\pak01_*.vpk`, `csgo\shaders_vulkan_*.vpk`, `core\shaders_vulkan_*.vpk`, `csgo\maps\*_vanity.vpk`). See `C:\cs2-data\VERSION.md` for the game version they come from; recopy after a CS2 update.
2. Node.js (LTS).
3. The .NET 10 SDK, portable, in `C:\dev\tools\dotnet-sdk-10` (the official zip from Microsoft, checked against its SHA-512).
4. The ValveResourceFormat 20.1 package from its [official release](https://github.com/ValveResourceFormat/ValveResourceFormat/releases/tag/20.1), saved as `C:\dev\tools\vrf-feed\ValveResourceFormat.20.1.7467.nupkg` (`nuget.config` uses that folder; the other packages come from nuget.org).
5. Build the tool (PowerShell). The cache and the build output stay under `C:\dev\tools`:

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
# 2. The items (about 10 s)
node pipeline\build.mjs
# 3. The maps (a few seconds)
node pipeline\build-maps.mjs
```

Then start the viewer (`cd viewer; npm.cmd run dev`) and open, for example:

```
http://127.0.0.1:5320/skin/weapon_knife_karambit/am_ruby_marbleized?fp=1&fpg=specialist_gloves%7Cspecialist_kimono_diamonds_red
```

`CS2_SOURCE`, `CS2_EXTRACTED`, `CS2_REFERENCE` and `SHADER_DUMP` override the default folders and the tool's path.

## Output

```
C:\cs2-data\extracted\
  shaders-raw\              the game's shaders as dumped (Vulkan GLSL, tables)
  work\                     intermediate files: material and KV3 dumps, items_game, localization, job reports, sizes.json
  web\extracted\game\       models and textures at their game paths
  web\extracted\viewer\     the viewer's JSON and converted shaders
```

`web\` is what the viewer's dev server serves at `/assets/`.

## Adding items

Add knives, gloves (with their paint kit names, as in `items_game.txt`) and agents to `items.json`, and a knife's idle and inspect clips under `firstPerson`. Classic glove paints are built; newer (v2) glove paints are reported and need their compositor data (phase 2).

A map needs its vanity VPK in the copies and a screenshot of the map taken in game with no hands, weapon or HUD, saved in `C:\cs2-data\reference`. In `items.json`: `"maps": { "<id>": { "name": "…", "background": "C:/cs2-data/reference/<file>.jpg", "viewYaw": -30 } }`. The screenshot's own direction isn't known, so `viewYaw` turns the eye from the direction the sun's light travels (degrees, left positive), which sets where the sun lights the hands from.

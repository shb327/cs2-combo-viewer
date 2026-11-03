# Viewer

The browser viewer for Combo Skin: a CS2 knife in a pair of gloves, first person, drawn with the game's own compositing shaders.

It started from the [ChainSkins 3D Viewer](https://github.com/ChainSkins/cs2-3d-viewer) (MIT, see [LICENSE](LICENSE) and [UPSTREAM.md](UPSTREAM.md) for the imported commit and what was left out). Their [README at that commit](https://github.com/ChainSkins/cs2-3d-viewer/blob/ffe3a5b5ee0fc283a3d526f5f6164d6b57453eb7/README.md) documents the code in depth: routes, URL parameters, the viewer's modules, the shader ports and the `postMessage` API. Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

```powershell
npm.cmd ci
npm.cmd run dev        # http://127.0.0.1:5320
npm.cmd run typecheck
```

The game assets are not in this repository. The dev server serves them at `/assets/` from `C:\cs2-data\extracted\web` (`CS2_ASSET_DIR` in `.env.local` changes it). They are built by [../pipeline](../pipeline/README.md); their format is in [../docs/asset-format.md](../docs/asset-format.md).

A first-person combo:

```
http://127.0.0.1:5320/skin/weapon_knife_karambit/am_ruby_marbleized?fp=1&fpg=specialist_gloves%7Cspecialist_kimono_diamonds_red&fpa=customplayer_t_map_based
```

## Changes from upstream

- No watermark, embed badge or upstream branding; screenshots and share images carry nothing added.
- No requests to upstream hosts: no asset server, home video, image proxy or db.json (a small local stand-in, `src/lib/data/local-db.ts`, gives rarities until Combo Skin's catalog does).
- The compositing shaders (weapons and gloves) are loaded from the asset folder at runtime, as the pipeline exports them; classic gloves run on the game's own combo like the newer ones.
- The default first-person agent is the Terrorist (`customplayer_t_map_based`).

> Not affiliated with or endorsed by Valve Corporation. Counter-Strike and CS2 are trademarks of Valve Corporation. The game's models, textures, maps and shaders belong to Valve and are not in this repository.

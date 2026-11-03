# Upstream

`viewer/` started as the ChainSkins 3D Viewer, MIT-licensed (see [LICENSE](LICENSE)).

- Repository: https://github.com/ChainSkins/cs2-3d-viewer
- Imported commit: `ffe3a5b5ee0fc283a3d526f5f6164d6b57453eb7` (2026-11-01)

## Left out of the import

These paths of the upstream tree hold material derived from the game, so they were never copied here:

| Path | Why |
| --- | --- |
| `src/lib/materials/generated/` | Glove shader generated from the game's decompiled `csgo_customglove`. Our pipeline writes its own copy outside git. |
| `public/icons/categories/` | Item icons from the game. |

## Pulling later changes

The import is a filtered copy, not a subtree, so updates come in as a filtered diff:

```sh
git -C <clone of upstream> fetch
git -C <clone of upstream> diff <imported commit> <new commit> -- . \
  ':(exclude)src/lib/materials/generated' ':(exclude)public/icons/categories' > upstream.patch
git apply --3way --directory=viewer upstream.patch
```

Then update the imported commit above.

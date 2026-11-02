# Roadmap

Each phase ends with something that runs. Later phases are rough and will change.

| Phase | Result | Status |
| --- | --- | --- |
| 0. Research | How existing viewers work and where the data lives ([landscape](landscape.md), [how it works](how-it-works.md)) | Done |
| 1. Pipeline spike | One knife and one pair of gloves extracted, with one paint kit each, loading in a bare three.js page | Next |
| 2. One skin, right | A knife drawn with its real finish at any float and seed, matching the game side by side | |
| 3. Gloves | The same for gloves | |
| 4. First person | The knife in the gloves, with the arms rig and inspect animation | |
| 5. Embed API | The viewer in an iframe, driven by `postMessage`, used from a Combo Skin test page | |
| 6. Screenshots | Headless rendering of a combo to images | |
| 7. Coverage | Every knife and glove finish; the full asset pipeline; hosting | |
| 8. Polish | Inspect maps as backgrounds, attack animations, performance on low-end devices | |

## Decisions before phase 1

- Start from the MIT-licensed ChainSkins viewer, or from scratch.
- WebGL2 first, or WebGPU first.
- Which tools the asset pipeline builds on.

## How work is done

Each piece starts as a spec with testable acceptance criteria, gets built against it, and is checked against it before it counts as done.

# Screenshot worker

Makes Combo Skin's combo screenshots. It asks the Combo Skin API which combo needs one, draws it with this repository's
viewer in a headless Chrome on the machine's GPU, and sends the PNG back. The API's side is in
[shb327/combo-skin](https://github.com/shb327/combo-skin) (`api/README.md`, "Screenshots"; spec 015).

Plain Node, no packages: Chrome is driven over the DevTools protocol with Node's own `fetch` and `WebSocket`.

## How it works

1. **Its own viewer**, built once by `npm run build` and pinned to one asset release (`VITE_ASSET_RELEASE`), served by
   the worker on `http://127.0.0.1:5321` (or `5320`, `WORKER_VIEWER_PORT`). Only these two ports: the asset bucket's
   CORS allows only the viewer's local ports. The assets come from `https://assets.combo.skin`.
2. **One Chrome** (headless, the GPU on, its own profile) and **one page** on `/combo?capture=1`, kept open between
   shots of a queue ([embed.md, "Capturing"](../docs/embed.md#capturing)). Chrome runs only while there's work: it is
   checked at the start (its GPU, WebGL2, the release), closed after `WORKER_BROWSER_IDLE` seconds without a shot, and
   started again with the next claim; while idle only Node runs, polling. The profile stays on disk, so the HTTP and
   shader caches stay warm. On an M4 Pro, run by hand: Chrome is ready about 0.5 s after the claim and the first shot
   after idle is stored in about 2 s (a warm shot about 0.6 s); Chrome takes about 500 MB open and up to about 800 MB
   while drawing, Node alone about 30 MB.
3. **A browser that dies** (killed, crashed, or its DevTools connection lost, after the Mac slept for example) is
   closed for good and a new one started; the worker carries on. A Chrome left on the profile by a worker that was
   killed is stopped before a new one starts.
4. **The loop**: `GET /worker/me`, then `POST /worker/jobs/claim`. For each job: `cs3d:load` with the job's combo,
   wait for `cs3d:captureReady`, `cs3d:capture`. Then the PNG is checked (1920×1080, 8-bit, not blank or transparent),
   tagged, and sent with `PUT /worker/jobs/{job}/screenshot`. Next claim. A 204 means nothing is due.
5. **The release** each shot was taken with goes into the PNG as `tEXt` chunks: `cs3d-release`,
   `cs3d-render-revision` and `combo-id`. The API keeps originals byte for byte; its public WebPs are made from the
   pixels only. The release is also in the `starting` log line and in each `rendered` line.

A job's seed that is null is left out, and the viewer draws its default (0). A vanilla knife has no float and no seed.

### When a shot fails

| What happened | What the worker does |
| --- | --- |
| `unknown-knife`, `unknown-gloves`, `unknown-*-finish`, `unknown-agent` | `fail` with `asset_missing` |
| `assets-unavailable` (a file wouldn't load) | One more try in a fresh page, then `fail` with `asset_missing` |
| `context-lost`, the page crashed | One more try in a fresh page, then `fail` with `render_failed` |
| `bad-params`, a blank or wrongly sized frame | `fail` with `render_failed` |
| No `cs3d:captureReady` within the timeout | `fail` with `timeout`; the next job starts in a fresh page |
| No WebGL2 in the browser | `release` with `gpu_unavailable`, and the worker stops (exit 4) |
| The browser dies during the shot | One more try in a new browser, then `fail` with `render_failed` |
| Chrome won't start (3 tries, 10 s apart) | `release` with `shutting_down`, and the worker stops (exit 5) |
| Upload: 409 `inputs_changed`, 404 `job_not_found` | Logged; no report (the combo changed or was claimed again); next claim |
| Upload: 409 `claim_expired` | Logged; no report (the expired lease already counted) |
| Upload: 413, 415, 422 | Logged as an error (a bug in the worker); `fail` with `render_failed`, the code in the detail |
| Network errors and 5xx | Tried again with backoff, while the lease lasts (uploads) |
| 401 | The worker stops (exit 2): the token was revoked or mistyped |

### Stopping

Ctrl+C or `SIGTERM`: no new claims; the render in progress is cancelled and its claim released (`shutting_down`, not
counted as a failure); then Chrome and the server are closed. A second signal exits at once (the claim then expires
after its 5 minutes).

## Settings

All from environment variables. The token is never written to a file in this repository, never printed or logged
(log lines are filtered for it as well).

| Variable | Default | Meaning |
| --- | --- | --- |
| `COMBO_API_URL` | required | The API's address, e.g. `http://127.0.0.1:8000`. `https`, or plain `http` only for localhost |
| `COMBO_WORKER_TOKEN` | required | The worker's token from the dashboard's Screenshots page (`csw_` and 43 characters) |
| `WORKER_RENDER_TIMEOUT` | `120` | Seconds for one combo (load and capture), 10 to 270, and always under the lease |
| `WORKER_POLL_INTERVAL` | `60` | Seconds to wait after a 204 before claiming again (polling mode) |
| `WORKER_BROWSER_IDLE` | `60` | Seconds without a shot before Chrome is closed (10 to 3600); the next claim starts it again |
| `WORKER_VIEWER_PORT` | `5321` | The port the worker serves its viewer on: `5321` or `5320` (the only two the asset bucket's CORS allows) |
| `WORKER_LOG_FILE` | stdout | A file to log to instead; moved to `<file>.1` at 5 MB, so at most two files (the service sets it) |
| `CHROME_PATH` | the usual install | macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, Windows `C:\Program Files\Google\Chrome\Application\chrome.exe`, Linux `/usr/bin/google-chrome` |
| `WORKER_PROFILE_DIR` | `~/.cache/cs2-combo-worker/chrome-profile` | The worker's own Chrome profile (its caches); never your everyday profile |
| `WORKER_ASSET_RELEASE` | the bucket's current | For `npm run build` only: the release to pin |

## Commands

From `worker/`:

| Command | Does |
| --- | --- |
| `npm run build` | Builds the viewer into `viewer-dist/` pinned to the current release (needs `npm ci` in `viewer/` once) |
| `npm start` | Polls: works through the queue, then claims again every `WORKER_POLL_INTERVAL` |
| `npm run once` | Works through the queue and exits at the first 204 |
| `npm test` | The tests, against a fake API and a fake browser (no Chrome, no network) |
| `npm run e2e` | End to end with Chrome and the assets from R2, against the fake API ([below](#checks)) |
| `npm run refcheck -- --refs <folder> --out <folder>` | Compares the viewer's knives with reference pictures ([below](#reference-check)) |

Exit codes: 0 done, 1 unexpected error, 2 settings or token refused, 3 the viewer's port (5321) in use, 4 no usable
GPU, 5 Chrome can't be started.

After a CS2 update and a new asset release: `npm run build` again, then restart the worker (as a service:
`service/install.sh` again).

## On the Mac

The recommended place to run it: the API runs there, so the token never leaves the machine, and the GPU draws the
combos.

**Needs**: Node 24 (`node --version`: v24.3.0 or later), git, and Google Chrome in `/Applications/Google Chrome.app`.

**Once:**

```bash
git clone https://github.com/shb327/cs2-combo-viewer.git   # or: cd cs2-combo-viewer && git pull
cd cs2-combo-viewer/viewer && npm ci
cd ../worker && npm run build
```

Make a worker on the dashboard's Screenshots page (for example `mac`) and keep its token in the login keychain.
`security` asks for the token without echoing it:

```bash
security add-generic-password -a "$USER" -s combo-skin-worker -w
```

**Each run** (with the API up: `curl http://127.0.0.1:8000/health/ready`), from `cs2-combo-viewer/worker`:

```bash
COMBO_API_URL=http://127.0.0.1:8000 COMBO_WORKER_TOKEN="$(security find-generic-password -a "$USER" -s combo-skin-worker -w)" npm run once
```

`npm start` instead of `npm run once` keeps it polling until Ctrl+C. The first time, macOS may ask whether to let the
keychain item be read by `security`: allow it. Chrome runs headless; no window opens.

### Run as a service

`service/install.sh` installs the worker as the LaunchAgent `skin.combo.screenshot-worker`: it starts at login,
starts again whenever it exits (at most once a minute, so a broken setup can't spin), and runs at background
priority (`ProcessType` `Background`), giving way to your own work. Shots are slower under it: a few seconds each.

- **The token**: `service/start.sh` reads it from the login keychain at each start
  (`security find-generic-password -a "$USER" -s combo-skin-worker -w`) and hands it to Node in its environment only:
  it is not in the plist, any file or the log. If macOS asks whether `security` may use the item, choose
  **Always Allow**, or each start waits for an answer. Without the item the start fails and is tried again a minute
  later.
- **Where it runs from**: launchd's jobs can't read `~/Documents`, `~/Desktop` or `~/Downloads` (macOS privacy
  protection), so install copies `src/`, `service/` and `viewer-dist/` to
  `~/Library/Application Support/combo-skin/screenshot-worker/`. **After a `git pull` or `npm run build`, run
  `service/install.sh` again.**
- **Settings** at install: `COMBO_API_URL` (default `http://127.0.0.1:8000`), `WORKER_VIEWER_PORT` (default `5321`),
  `WORKER_PROFILE_DIR`, `WORKER_NODE` (default: `node` on `PATH`, 24 or later). Install records the absolute paths;
  nothing machine-specific is in the repository.
- **The log**: `~/Library/Logs/combo-skin/screenshot-worker.log`, moved to `.log.1` at 5 MB.

From `cs2-combo-viewer/worker`, with the worker started by hand stopped first (install refuses while something holds
port 5321):

```bash
service/install.sh      # install, or update after a pull or a build
service/status.sh       # loaded or not, running or not, the last exit, the log's last lines (service/status.sh 50)
service/uninstall.sh    # stop it (the job in hand is released) and remove it; the log is kept
```

## Checks

`npm test` runs the unit tests and the contract tests against `test/fake-api.mjs`, a stand-in that follows the API's
README: tokens and 401, 403 for a request with an `Origin` header, the claim and its lease, 204, the PNG checks (413,
415, 422 `not_png` / `wrong_size` / `bad_pixel_format`), `fail` and `release`, 409 `claim_expired` and
`inputs_changed`, 404 `job_not_found`. The browser's life (started again when it dies, given up on when it won't
start, closed when idle) is tested with `test/fake-chrome.mjs`, and the service's scripts with stand-ins for
`launchctl`, `lsof` and `security` (nothing is loaded, the keychain isn't read).

`npm run e2e` (after `npm run build`; the viewer's port free, so `WORKER_VIEWER_PORT=5320` next to a running worker)
draws four combos (the reference, Big Swell, a vanilla Butterfly Knife, Bloody Darryl The Strapped) cold in a new
browser and warm in the same one, checks each capture against the browser's own screenshot of the page, then runs
`node src/main.mjs --once` through a queue of the four and a combo without seeds against the fake API. `E2E_OUT` and
`E2E_PROFILES` choose where the PNGs, `timings.json` and the browser profiles go (default `test/.tmp/`, not in git).

## Reference check

`npm run refcheck -- --refs <folder> --out <folder>` compares the viewer's knives with reference pictures of the same
knives from another inspect view (a black background, the knife side on). It is a check to run by hand after a change
to how finishes are drawn; nothing in it runs in the worker's loop.

- **Input**: `<folder>/manifest.csv`, one row per picture: `picture`, `group`, `knife`, `finish`, `phase`, `seed`,
  `wear`, `side` (`front` or `back`), with knives and finishes as Combo Skin's pattern groups write them
  (`m9-bayonet`, `gamma-doppler-phase-4`). The pictures stay where they are: they are never copied into the repository.
- **Ours**: every knife drawn by this worker's own build (`viewer-dist/`, `npm run build` first) served on
  `127.0.0.1:5320` (the worker keeps 5321): the single-item embed in the studio's light, the knife alone, front and back
  (`cs3d:screenshots`), at the manifest's seed and wear. The same knife vanilla, drawn the same way, gives the painted
  parts: where the finish differs from it.
- **Lining up**: by the outline only. Our front and back, each mirrored or not, are turned, scaled and moved for the
  best overlap (IoU) with the reference's outline. When two arrangements fit the outline equally (a near-symmetric
  knife), the pattern chooses, and the report marks it.
- **Scores** (0–1, on the painted parts only, the light's colour matched on the bare parts first):
  - Case Hardened: where blue and gold sit (rank correlation of b*) and how much blue there is.
  - Scorched, Safari Mesh, Urban Masked: where light and dark sit, and how much the paint varies, measured in a band
    of scales that leaves out the light's own slow bands along a blade; and the overall tone.
  - Fade, Marble Fade, Doppler and Gamma Doppler: the hue gap pixel by pixel, and the mix of colours.
  - A pair below 0.5 is flagged. Checked on the two earlier fixes: Bayonet | Case Hardened 395 scores 0.43 and 0.30
    before "Size knife textures by the composite's UV scale" and 0.88 and 0.90 after; Shadow Daggers | Scorched 730
    0.47 and 0.44 before "Size spray and airbrush knife patterns by weapon length" and 0.73 and 0.85 after.
- **Output** in `--out`: `report.md` (the table, worst first: arrangement, outline overlap, score, our other side's
  score, a likely cause), `results.csv`, `results.json`, `sheets/` (the reference, ours as it fits, and our other side,
  for each flagged pair) and `contact-sheet.png` (every pair). Renders are kept in `renders/<release>-<commit>/`, so a
  second run only scores; `--fresh` draws them again.

Options: `--only <text>[,<text>…]` checks only the pictures whose name contains one of them, `--sheets all` writes a
sheet for every pair, `--viewer-dist <folder>` uses another build (to compare before and after a change).
`node --test test/refcheck.test.mjs` tests the alignment and the scores on synthetic pictures.

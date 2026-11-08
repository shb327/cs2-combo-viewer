# Screenshot worker

Makes Combo Skin's combo screenshots. It asks the Combo Skin API which combo needs one, draws it with this repository's
viewer in a headless Chrome on the machine's GPU, and sends the PNG back. The API's side is in
[shb327/combo-skin](https://github.com/shb327/combo-skin) (`api/README.md`, "Screenshots"; spec 015).

Plain Node, no packages: Chrome is driven over the DevTools protocol with Node's own `fetch` and `WebSocket`.

## How it works

1. **Its own viewer**, built once by `npm run build` and pinned to one asset release (`VITE_ASSET_RELEASE`), served by
   the worker on `http://127.0.0.1:5321`. That port is fixed: the asset bucket's CORS allows only the viewer's local
   ports. The assets come from `https://assets.combo.skin`.
2. **One Chrome** (headless, the GPU on, its own profile) and **one page** on `/combo?capture=1`, kept open between
   shots so its HTTP and shader caches stay warm ([embed.md, "Capturing"](../docs/embed.md#capturing)).
3. **The loop**: `GET /worker/me`, then `POST /worker/jobs/claim`. For each job: `cs3d:load` with the job's combo,
   wait for `cs3d:captureReady`, `cs3d:capture`. Then the PNG is checked (1920×1080, 8-bit, not blank or transparent),
   tagged, and sent with `PUT /worker/jobs/{job}/screenshot`. Next claim. A 204 means nothing is due.
4. **The release** each shot was taken with goes into the PNG as `tEXt` chunks: `cs3d-release`,
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
| `npm test` | The tests, against a fake API (no browser, no network) |
| `npm run e2e` | End to end with Chrome and the assets from R2, against the fake API ([below](#checks)) |

Exit codes: 0 done, 1 unexpected error, 2 settings or token refused, 3 port 5321 in use, 4 no usable GPU.

After a CS2 update and a new asset release: `npm run build` again, then restart the worker.

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

## Checks

`npm test` runs the unit tests and the contract tests against `test/fake-api.mjs`, a stand-in that follows the API's
README: tokens and 401, 403 for a request with an `Origin` header, the claim and its lease, 204, the PNG checks (413,
415, 422 `not_png` / `wrong_size` / `bad_pixel_format`), `fail` and `release`, 409 `claim_expired` and
`inputs_changed`, 404 `job_not_found`.

`npm run e2e` (after `npm run build`; port 5321 free) draws four combos (the reference, Big Swell, a vanilla Butterfly
Knife, Bloody Darryl The Strapped) cold in a new browser and warm in the same one, checks each capture against the
browser's own screenshot of the page, then runs `node src/main.mjs --once` through a queue of the four and a combo
without seeds against the fake API. `E2E_OUT` and `E2E_PROFILES` choose where the PNGs, `timings.json` and the browser
profiles go (default `test/.tmp/`, not in git).

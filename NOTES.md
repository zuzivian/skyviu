# skyviu notes

Single-page app (`index.html`) plus two Vercel edge proxies (`api/aircraft.mjs` for adsb.lol,
`api/orbits.mjs` for CelesTrak). No build step. `package.json` exists only to pin Playwright and
run the smoke test (`npm test`); CI runs it on every push and PR.

## Done
- 2026-11-07 (autopilot): fixed three live-update bugs in `index.html`.
  - The 1-second tick redrew the sky chart without moving planes, so they only jumped every 10 s.
    It now calls `updatePositions()` first.
  - Switching place while a fetch was in flight kept the old area's planes under the new place's
    title, and no new fetch went out for 10 s. Stale answers are now dropped and the new place is
    fetched straight away.
  - Every 10 s refresh rebuilt the card and "Next planes" list and dropped keyboard focus to
    `<body>`. Focus now goes back to the same button (`data-focus` keys).

- 2026-11-07 (autopilot, run 2):
  - `load()` cancels the in-flight request (AbortController) when the place changes and asks for
    the new place straight away. Before, it waited for the old answer, up to the proxy's 8 s
    timeout. This replaces run 1's `load.busy` flag and its retry in `finally`.
  - New "Planes you can see now" list (`#now`, `renderNow()`): one button per visible plane, sorted
    easiest to spot first, so keyboard and screen-reader users can pick one. The chart's
    `aria-label` points to it.
  - `test/smoke.mjs`: Playwright with `/api/*` mocked. Run `node test/smoke.mjs` (takes ~20 s, one
    test waits for a 10 s refresh).

- 2026-11-10 (autopilot, run 3, approved in the brief):
  - `package.json` (one dev dependency, `playwright` 1.63.0 exact, `npm test` script),
    `package-lock.json`, and `.github/workflows/smoke.yml` (checkout and setup-node pinned to
    commit SHAs, Node 22, `npm ci`, `playwright install --with-deps chromium`, `npm test`).
  - `README.md`: what it is, how it works, query params, tests, deploy.

## Next
- The camera view's labels are only reachable by pointing the phone. The new `#now` list is under
  the camera too, but check it with VoiceOver on a phone.
- CI runs twice on a PR branch (push and pull_request). Cheap, but `push: branches: [main]`
  would halve it if Nat prefers.

## Gotchas
- Run checks with `npm test` (same as `node test/smoke.mjs`).
- In the autopilot container, registry.npmjs.org doesn't resolve, so `npm install` fails. Run 3
  wrote the lockfile by hand from the hashes in `/opt/node-tools/package-lock.json`; `npm ci
  --offline` works from the local cache. To bump Playwright, do it on a machine with npm access. For a syntax check, pull the `<script>` out of
  `index.html` into a file and run `node --check` on it (process substitution doesn't work).
- `render()` rebuilds the head, card, Next and Also lists on every data update (10 s). Anything
  interactive inside them needs a `data-focus` key, or keyboard focus is lost.
- Between updates only `renderChart()` runs (sky view) or `drawAR()` (camera view). Plane
  visibility (`p.see`) is judged only in `render()`.

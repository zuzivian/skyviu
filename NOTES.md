# skyviu notes

Single-page app (`index.html`) plus two Vercel edge proxies (`api/aircraft.mjs` for adsb.lol,
`api/orbits.mjs` for CelesTrak). No build step. `package.json` exists only to pin Playwright and
run the proxy and smoke tests (`npm test`); CI runs them on every push and PR.

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

- 2026-11-10 (since run 3):
  - Added agent rules and the fleet handoff protocol (#2, #6).
  - Added smoke tests for `?at=` and `?plane=` deep links (#7).
  - Added unit tests for both edge proxies with fetch stubbed and no network (#8).
  - Added the README map of `index.html` and its update cycle (#9).

- 2026-11-11:
  - Added the Chinny runner: Codex CLI on GitHub Actions (#10).
  - Updated the runner's sandbox option and CLI error reporting (#12).
  - Enabled the runner's sandbox to start with unprivileged user namespaces (#13).
  - Installed dependencies before running Chinny and tightened usage-limit detection and reporting (#14).
  - Added the README's "Run the tests" section (#15).
  - Added usage reporting and a periodic usage probe (#16).
  - Made the usage probe hourly and added weekly reset timing (#26).

- 2026-11-12:
  - Made `?at=` place links case-insensitive (#24).
  - Added smoke tests for the "Show all in range" toggle (#25).
  - Stopped the status live region from rewriting identical text every 10 s (#27).
  - Added smoke tests that ground and stale planes never count as visible (#28).
  - Derived the status line's range from `NM` and removed unused `noPosition` counting (#29).
  - Cleared the old error on place changes and added smoke tests for error recovery (#38).
  - Made `npm test` run proxy unit tests before the smoke suite (#39).
  - Made the aircraft proxy reject blank coordinates and malformed upstream answers (#40).
  - Added browser-free unit tests for sky geometry, visibility and sun position helpers (#41).
  - Showed an error when an aircraft response has no aircraft list (#42).

## Next
- The camera view's labels are only reachable by pointing the phone. The new `#now` list is under
  the camera too, but check it with VoiceOver on a phone.
- CI runs twice on a PR branch (push and pull_request). Cheap, but `push: branches: [main]`
  would halve it if Nat prefers.

## Gotchas
- Install dependencies with `npm ci`, then run `npx playwright install chromium` once.
- `npm test` runs `node test/api.mjs` followed by `node test/smoke.mjs`. The proxy tests stub
  fetch; the Playwright smoke tests mock `/api/*`. Neither suite needs live API access.
- Run `node test/astro.mjs` separately for the geometry, visibility and sun position tests;
  it is not included in `npm test`.
- Run 3's autopilot container could not resolve registry.npmjs.org; `npm ci --offline` worked
  from its local cache. That cache workaround depends on the environment. For a syntax check, pull the `<script>` out of
  `index.html` into a file and run `node --check` on it (process substitution doesn't work).
- `render()` rebuilds the head, card, Next and Also lists on every data update (10 s). Anything
  interactive inside them needs a `data-focus` key, or keyboard focus is lost.
- Between updates only `renderChart()` runs (sky view) or `drawAR()` (camera view). Plane
  visibility (`p.see`) is judged only in `render()`.

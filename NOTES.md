# skyviu notes

Single-page app (`index.html`) plus two Vercel edge proxies (`api/aircraft.mjs` for adsb.lol,
`api/orbits.mjs` for CelesTrak). No build step, no package.json, no test suite.

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

## Next
- No README yet.
- The camera view's labels are only reachable by pointing the phone. The new `#now` list is under
  the camera too, but check it with VoiceOver on a phone.
- The smoke test isn't in CI. There's no package.json; adding one plus a workflow is Nat's call.

## Gotchas
- Run checks with `node test/smoke.mjs`. For a syntax check, pull the `<script>` out of
  `index.html` into a file and run `node --check` on it (process substitution doesn't work).
- `render()` rebuilds the head, card, Next and Also lists on every data update (10 s). Anything
  interactive inside them needs a `data-focus` key, or keyboard focus is lost.
- Between updates only `renderChart()` runs (sky view) or `drawAR()` (camera view). Plane
  visibility (`p.see`) is judged only in `render()`.

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

## Next
- Keyboard and screen-reader users can't pick among the planes you can see right now. Only the
  chart's SVG marks are clickable, and "Next planes" lists only planes not yet in view. A list of
  buttons for the visible planes would fix it.
- Add a small Playwright smoke test with mocked `/api/*` routes. The repro script for the fixes
  above stubbed `**/api/aircraft**` and `**/api/orbits` and served `index.html` from a fake origin.
- No README yet.

## Gotchas
- `render()` rebuilds the head, card, Next and Also lists on every data update (10 s). Anything
  interactive inside them needs a `data-focus` key, or keyboard focus is lost.
- Between updates only `renderChart()` runs (sky view) or `drawAR()` (camera view). Plane
  visibility (`p.see`) is judged only in `render()`.

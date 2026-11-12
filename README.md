# skyviu

The planes you can actually see from Stanford right now, from public ADS-B data. Live at
[sky.natwong.dev](https://sky.natwong.dev/).

It also shows the Moon, the planets, the ISS and Tiangong, a sky chart, the next planes to come
into view, and a camera view that names the plane you point your phone at.

## How it works

- `index.html` is the whole app: one page, no build step, no framework.
- `api/aircraft.mjs` is a Vercel edge proxy for [adsb.lol](https://www.adsb.lol/) (no CORS
  header there). It rounds the location to about 1 km and caches each area for 10 s.
- `api/orbits.mjs` is a Vercel edge proxy for [CelesTrak](https://celestrak.org/) station orbits,
  cached for 2 hours as CelesTrak asks.

Links can name a place and a plane: `?at=KSFO` (or `stanford`, `KPAO`, `KSJC`) and
`?plane=<hex>`.

## Map of index.html

Find each name with `grep -n`. In file order:

- **`<style>`**: all the CSS, with the colours as variables under `:root`.
- **Markup (`<main>`)**: the title, `#head` and `#card` (the selected plane), the sky chart
  (`#sky`), the camera view (`#ar`, `#arsvg`), the place picker (`#place`), and the lists `#now`,
  `#also` and `#next`.
- **`<script>`**: one block, in this order.
  - Constants and data: `PLACES` (the four places in `?at=`), `AIRLINES` (ICAO code to name),
    `REFRESH_MS` (10 s).
  - `state`: the one object that holds the place, the aircraft, the selected plane and the view.
  - Positions and visibility: `locate()` and `updatePositions()` move the planes; `sunAt()` finds
    the sun; `judge()` decides whether a plane can be seen; `upcoming()` lists the next ones.
  - Data: `load()` fetches `/api/aircraft` and cancels an older request when the place changes;
    `schedule()` starts it and repeats it every `REFRESH_MS`; `loadOrbits()` fetches `/api/orbits`.
  - Drawing: `render()` runs `renderStatus`, `renderChart`, `renderHead`, `renderCard`,
    `renderNow`, `renderNext` and `renderAlso`. `renderChart()` draws the sky chart, or calls
    `drawAR()` when the camera view is on.
  - Setup at the bottom: `setObserver()` switches place and starts loading, then the 1-second
    tick, then the `?at=` and `?plane=` link handling.

**Every 10 s** (each `load()`): `render()` redraws everything, including the head, card, `#now`,
`#next` and `#also`. **Every second** (the tick): `updatePositions()` then `renderChart()`, which
only moves the planes. `drawAR()` also calls `updatePositions()` itself.

Anything interactive inside what `render()` rebuilds needs a `data-focus` key, or keyboard focus
is lost. See the gotchas in `NOTES.md`.

## Running it locally

The page calls `/api/aircraft` and `/api/orbits`, so serve it with something that runs the
`api/` functions too, such as `vercel dev`. A plain static server shows the page with no data.

## Run the tests

Install dependencies with `npm ci`, then run `npx playwright install chromium` once.

- `npm test` runs the proxy unit tests first, then the Playwright smoke checks; no server or live API is needed.
- `node test/api.mjs` runs the proxy unit tests directly with fetch stubbed and no network.
- `node test/smoke.mjs` runs the Playwright smoke checks directly with `/api/*` mocked.

The checks take about 20 s. CI runs them on every push and pull request.

## Deploying

Vercel uploads only `index.html` and `api/` (see `.vercelignore`).

Aircraft data from adsb.lol, ODbL 1.0. Not for navigation.

# skyviu

The planes you can actually see from Stanford right now, from public ADS-B data. Live at
[sky.natwong.dev](https://sky.natwong.dev/).

It draws your sky as a 360° horizon panorama, with the Moon, the planets and the next planes to
come into view.

## How it works

- `index.html` is the whole app: one page, no build step, no framework.
- `api/aircraft.mjs` is a Vercel edge proxy for [adsb.lol](https://www.adsb.lol/) (no CORS
  header there). It rounds the location to about 1 km and caches each area for 10 s.

Links can name a place and a plane: `?at=KSFO` (or `stanford`, `KPAO`, `KSJC`) and
`?plane=<hex>`.

## Map of index.html

Find each name with `grep -n`. In file order:

- **`<style>`**: all the CSS, with the colours as variables under `:root`.
- **Markup (`<main>`)**: the title, `#head` and `#card` (the selected plane), the horizon
  panorama (`#sky` inside `.pano`), the place picker (`#place`), and the lists `#now` and `#next`.
- **`<script>`**: one block, in this order.
  - Constants and data: `PLACES` (the four places in `?at=`), `AIRLINES` (ICAO code to name),
    `REFRESH_MS` (10 s).
  - `state`: the one object that holds the place, the aircraft and the selected plane.
  - Positions and visibility: `locate()` and `updatePositions()` move the planes; `sunAt()` finds
    the sun; `judge()` decides whether a plane can be seen; `upcoming()` lists the next ones.
  - Data: `load()` fetches `/api/aircraft` and cancels an older request when the place changes;
    `schedule()` starts it and repeats it every `REFRESH_MS`.
  - Drawing: `render()` runs `renderStatus`, `buildChart`, `describeSky`, `renderHead`,
    `renderCard`, `renderNow`, `renderNext` and `centreSelected`. `buildChart()` makes every node
    of the horizon panorama, using the pure `panoX()`/`panoY()` mapping from bearing and
    elevation, and keeps the moving ones in `view.marks`. `moveChart()` moves those nodes with
    CSS transforms. `textWidth()` measures labels on a canvas, cached by plane and callsign.
  - Links: `placeURL()` gives the address for a place; `sharePlane()` adds the plane.
  - Setup at the bottom: `setObserver()` switches place and starts loading, then the 1-second
    tick, then the `?at=` and `?plane=` link handling.

**Every 10 s** (each `load()`), on resize and on selection: `buildChart()` rebuilds the panorama,
and `render()` also redraws the head, card, `#now` and `#next`. **Every second** (the tick):
`updatePositions()` then `moveChart()`, which only sets each plane's CSS `transform` (they glide
with `transition: transform 1s linear`). It never adds nodes, measures text or calls `getBBox()`.
Under `prefers-reduced-motion` the transitions are off and the planes jump once a second.

Anything interactive inside what `render()` rebuilds needs a `data-focus` key, or keyboard focus
is lost. See the gotchas in `NOTES.md`.

## Running it locally

The page calls `/api/aircraft`, so serve it with something that runs the
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

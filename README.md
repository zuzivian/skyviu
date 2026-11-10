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

## Running it locally

The page calls `/api/aircraft` and `/api/orbits`, so serve it with something that runs the
`api/` functions too, such as `vercel dev`. A plain static server shows the page with no data.

## Tests

```sh
npm ci
npx playwright install chromium   # once
npm test
```

`npm test` runs `test/smoke.mjs`: Playwright with `/api/*` mocked, so it needs no server or
network. It takes about 20 s. CI runs it on every push and pull request
(`.github/workflows/smoke.yml`).

## Deploying

Vercel uploads only `index.html` and `api/` (see `.vercelignore`).

Aircraft data from adsb.lol, ODbL 1.0. Not for navigation.

// Smoke test for index.html with the /api routes mocked. No server or network needed.
// Run: node test/smoke.mjs   (needs the playwright package and its Chromium)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ORIGIN = 'http://skyviu.test';

// One airliner 60° up due north of whatever point was asked for, so it counts as visible
// day or night and is far from the sun.
function planeNear(lat, lon, flight, hex) {
  const northM = 6096 / Math.tan(Math.PI / 3);
  return {
    now: Date.now(),
    ac: [{
      hex, flight, lat: lat + northM / 111195, lon, alt_baro: 20000, alt_geom: 20000,
      gs: 300, track: 90, category: 'A3', t: 'B738', r: 'N1', seen_pos: 0, type: 'adsb_icao',
    }],
  };
}

async function open(browser, { holdFirstStanford = 0 } = {}) {
  const page = await browser.newPage();
  const errors = [];
  const calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(`${ORIGIN}/`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route(`${ORIGIN}/?*`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/api/orbits', (r) => r.fulfill({ json: { objects: [] } }));
  let stanfordCalls = 0;
  await page.route('**/api/aircraft**', async (r) => {
    const q = new URL(r.request().url()).searchParams;
    const lat = +q.get('lat'), lon = +q.get('lon');
    const sjc = Math.abs(lat - 37.36) < 0.01;
    calls.push(sjc ? 'sjc' : 'stanford');
    if (!sjc && stanfordCalls++ === 0 && holdFirstStanford) await new Promise((ok) => setTimeout(ok, holdFirstStanford));
    try {
      await r.fulfill({ json: sjc ? planeNear(lat, lon, 'SWA2', 'a00002') : planeNear(lat, lon, 'UAL1', 'a00001') });
    } catch { /* the page cancelled this request */ }
  });
  await page.goto(`${ORIGIN}/`);
  return { page, errors, calls };
}

const tests = {
  async 'shows the visible plane'(browser) {
    const { page, errors } = await open(browser);
    await page.waitForFunction(() => /1 plane you can see from Stanford/.test(document.querySelector('#title').textContent));
    assert.match(await page.textContent('#head'), /United Airlines 1/);
    assert.deepEqual(errors, []);
  },

  async 'switching place mid-request asks for the new place at once'(browser) {
    const { page, errors, calls } = await open(browser, { holdFirstStanford: 4000 });
    await page.waitForTimeout(200);
    await page.selectOption('#place', 'KSJC');
    // The held Stanford answer is still 3.8 s away; SJC must not wait for it.
    await page.waitForFunction(() => /Southwest Airlines 2/.test(document.querySelector('#head').textContent), null, { timeout: 2000 });
    await page.waitForTimeout(4500);
    assert.match(await page.textContent('#title'), /from San Jose Airport/);
    assert.match(await page.textContent('#head'), /Southwest Airlines 2/);
    assert.equal(calls[0], 'stanford');
    assert.equal(calls[1], 'sjc');
    assert.deepEqual(errors, []);
  },
};

const browser = await chromium.launch();
let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try { await run(browser); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`); }
}
await browser.close();
process.exit(failed ? 1 : 0);

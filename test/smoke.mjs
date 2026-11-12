// Smoke test for index.html with the /api routes mocked. No server or network needed.
// Run: node test/smoke.mjs   (needs the playwright package and its Chromium)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ORIGIN = 'http://skyviu.test';

// An airliner at 20,000 ft, `elDeg` up due north of the point asked for. High and north keeps
// it visible day or night and far from the sun.
function airliner(lat, lon, flight, hex, elDeg = 60) {
  const northM = 6096 / Math.tan(elDeg * Math.PI / 180);
  return {
    hex, flight, lat: lat + northM / 111195, lon, alt_baro: 20000, alt_geom: 20000,
    gs: 300, track: 90, category: 'A3', t: 'B738', r: 'N1', seen_pos: 0, type: 'adsb_icao',
  };
}
const planeNear = (lat, lon, flight, hex) => ({ now: Date.now(), ac: [airliner(lat, lon, flight, hex)] });

async function open(browser, { holdFirstStanford = 0, stanford = planeNear, query = '' } = {}) {
  const page = await browser.newPage();
  const errors = [];
  const calls = [];
  const requests = [];   // [lat, lon] exactly as the page sent them
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(`${ORIGIN}/`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route(`${ORIGIN}/?*`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/api/orbits', (r) => r.fulfill({ json: { objects: [] } }));
  let stanfordCalls = 0;
  await page.route('**/api/aircraft**', async (r) => {
    const q = new URL(r.request().url()).searchParams;
    const lat = +q.get('lat'), lon = +q.get('lon');
    requests.push([q.get('lat'), q.get('lon')]);
    const sjc = Math.abs(lat - 37.36) < 0.01;
    calls.push(sjc ? 'sjc' : 'stanford');
    if (!sjc && stanfordCalls++ === 0 && holdFirstStanford) await new Promise((ok) => setTimeout(ok, holdFirstStanford));
    try {
      await r.fulfill({ json: sjc ? planeNear(lat, lon, 'SWA2', 'a00002') : stanford(lat, lon, 'UAL1', 'a00001') });
    } catch { /* the page cancelled this request */ }
  });
  await page.goto(`${ORIGIN}/${query}`);
  return { page, errors, calls, requests };
}

const tests = {
  async 'shows the visible plane'(browser) {
    const { page, errors } = await open(browser);
    await page.waitForFunction(() => /1 plane you can see from Stanford/.test(document.querySelector('#title').textContent));
    assert.match(await page.textContent('#head'), /United Airlines 1/);
    assert.deepEqual(errors, []);
  },

  async 'ground and stale planes never count as visible'(browser) {
    const mixed = (lat, lon) => ({ now: Date.now(), ac: [
      airliner(lat, lon, 'UAL1', 'a00001'),
      { ...airliner(lat, lon, 'UAL2', 'a00002'), alt_baro: 'ground' },
      { ...airliner(lat, lon, 'UAL3', 'a00003'), alt_baro: 300, gs: 20 },
      { ...airliner(lat, lon, 'UAL4', 'a00004'), seen_pos: 120 },
    ] });
    const { page, errors } = await open(browser, { stanford: mixed });
    await page.waitForSelector('#now button[data-hex="a00001"]');
    assert.equal(await page.textContent('#title'), '1 plane you can see from Stanford');
    assert.equal(await page.locator('#now button').count(), 1);
    assert.equal(await page.getAttribute('#now button', 'data-hex'), 'a00001');
    // Stale aircraft still count as airborne; both kinds of ground aircraft do not.
    assert.equal(await page.textContent('#status'), 'Live · 1 of 2 planes within 29 miles');
    assert.deepEqual(errors, []);
  },

  async 'Show all in range toggles low aircraft on the sky chart'(browser) {
    const two = (lat, lon) => ({ now: Date.now(), ac: [airliner(lat, lon, 'UAL1', 'a00001', 60), airliner(lat, lon, 'UAL3', 'a00003', 5)] });
    const { page, errors } = await open(browser, { stanford: two });
    await page.waitForSelector('#sky [data-hex="a00001"]');
    assert.equal(await page.getAttribute('#showall', 'aria-pressed'), 'false');
    assert.equal(await page.textContent('#showall'), 'Show all 2 in range');
    assert.equal(await page.locator('#sky [data-hex="a00001"]').count(), 1);
    assert.equal(await page.locator('#sky [data-hex="a00003"]').count(), 0);

    await page.click('#showall');
    assert.equal(await page.getAttribute('#showall', 'aria-pressed'), 'true');
    assert.equal(await page.textContent('#showall'), 'Show only the 1 you can see');
    assert.equal(await page.locator('#sky [data-hex="a00001"]').count(), 1);
    assert.equal(await page.locator('#sky [data-hex="a00003"]').count(), 1);

    await page.click('#showall');
    assert.equal(await page.getAttribute('#showall', 'aria-pressed'), 'false');
    assert.equal(await page.textContent('#showall'), 'Show all 2 in range');
    assert.equal(await page.locator('#sky [data-hex="a00001"]').count(), 1);
    assert.equal(await page.locator('#sky [data-hex="a00003"]').count(), 0);
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

  async 'the planes you can see are buttons, and focus survives a refresh'(browser) {
    const two = (lat, lon) => ({ now: Date.now(), ac: [airliner(lat, lon, 'UAL1', 'a00001', 70), airliner(lat, lon, 'UAL3', 'a00003', 40)] });
    const { page, errors, calls } = await open(browser, { stanford: two });
    await page.waitForSelector('#now button[data-hex="a00003"]');
    assert.equal(await page.locator('#now button').count(), 2);
    // The easiest to spot is picked first.
    assert.match(await page.textContent('#head'), /United Airlines 1/);
    await page.focus('#now button[data-hex="a00003"]');
    await page.keyboard.press('Enter');
    assert.match(await page.textContent('#head'), /United Airlines 3/);
    assert.equal(await page.getAttribute('#now button[data-hex="a00003"]', 'aria-current'), 'true');
    assert.equal(await page.getAttribute('#now button[data-hex="a00001"]', 'aria-current'), null);
    const statusText = await page.textContent('#status');
    await page.evaluate(() => {
      window.statusMutations = 0;
      window.statusObserver = new MutationObserver((records) => { window.statusMutations += records.length; });
      window.statusObserver.observe(document.querySelector('#status'), { childList: true, characterData: true, subtree: true });
    });
    const callsBeforeRefresh = calls.length;
    await page.waitForTimeout(10500);   // one refresh
    assert.ok(calls.length > callsBeforeRefresh, 'the scheduled refresh must fetch aircraft');
    assert.equal(await page.textContent('#status'), statusText);
    assert.equal(await page.evaluate(() => {
      window.statusMutations += window.statusObserver.takeRecords().length;
      window.statusObserver.disconnect();
      return window.statusMutations;
    }), 0, 'unchanged status text must not mutate during a refresh');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.focus), 'now-a00003');
    assert.match(await page.textContent('#head'), /United Airlines 3/);
    assert.deepEqual(errors, []);
  },
  async 'deep link ?at=KSFO selects SFO and fetches its coordinates'(browser) {
    const { page, errors, requests } = await open(browser, { query: '?at=KSFO' });
    await page.waitForFunction(() => /from SFO/.test(document.querySelector('#title').textContent));
    assert.equal(await page.inputValue('#place'), 'KSFO');
    // SFO is 37.619806, -122.374821; Stanford is 37.4275, -122.1703.
    assert.deepEqual(requests[0].map(Number), [37.62, -122.37]);
    assert.deepEqual(errors, []);
  },

  async 'deep link ?at=ksfo selects SFO and canonicalizes the address'(browser) {
    const { page, errors, requests } = await open(browser, { query: '?at=ksfo' });
    await page.waitForFunction(() => /from SFO/.test(document.querySelector('#title').textContent));
    assert.equal(await page.inputValue('#place'), 'KSFO');
    assert.deepEqual(requests[0].map(Number), [37.62, -122.37]);
    assert.equal(new URL(page.url()).searchParams.get('at'), 'KSFO');
    assert.deepEqual(errors, []);
  },

  async 'deep link ?at=ME cannot select My location'(browser) {
    const { page, errors, requests } = await open(browser, { query: '?at=ME' });
    await page.waitForFunction(() => /from Stanford/.test(document.querySelector('#title').textContent));
    assert.equal(await page.inputValue('#place'), 'stanford');
    assert.deepEqual(requests[0].map(Number), [37.43, -122.17]);
    assert.equal(new URL(page.url()).searchParams.has('at'), false);
    assert.deepEqual(errors, []);
  },

  async 'deep link ?at= with an unknown place falls back to Stanford'(browser) {
    const { page, errors, requests } = await open(browser, { query: '?at=nowhere' });
    await page.waitForFunction(() => /from Stanford/.test(document.querySelector('#title').textContent));
    assert.equal(await page.inputValue('#place'), 'stanford');
    assert.deepEqual(requests[0].map(Number), [37.43, -122.17]);
    assert.deepEqual(errors, []);
  },

  async 'deep link ?plane= picks that plane'(browser) {
    const two = (lat, lon) => ({ now: Date.now(), ac: [airliner(lat, lon, 'UAL1', 'a00001', 70), airliner(lat, lon, 'UAL3', 'a00003', 40)] });
    const { page, errors } = await open(browser, { stanford: two, query: '?plane=a00003' });
    await page.waitForSelector('#now button[data-hex="a00003"]');
    // Without the link UAL1 (higher up) would be picked first.
    assert.equal(await page.getAttribute('#now button[data-hex="a00003"]', 'aria-current'), 'true');
    assert.equal(await page.getAttribute('#now button[data-hex="a00001"]', 'aria-current'), null);
    assert.match(await page.textContent('#head'), /United Airlines 3/);
    assert.deepEqual(errors, []);
  },

  async 'deep link ?plane= that is malformed is ignored'(browser) {
    const two = (lat, lon) => ({ now: Date.now(), ac: [airliner(lat, lon, 'UAL1', 'a00001', 70), airliner(lat, lon, 'UAL3', 'a00003', 40)] });
    const { page, errors } = await open(browser, { stanford: two, query: '?plane=zzz' });
    await page.waitForSelector('#now button[data-hex="a00003"]');
    assert.match(await page.textContent('#head'), /United Airlines 1/);
    assert.equal(await page.getAttribute('#now button[data-hex="a00001"]', 'aria-current'), 'true');
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

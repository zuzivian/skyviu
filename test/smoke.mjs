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

async function open(browser, { holdFirstStanford = 0, holdSjc = 0, failStanford = () => false, clock = false, stanford = planeNear, query = '', initScript, viewport, media } = {}) {
  const page = await browser.newPage(viewport ? { viewport } : {});
  if (media) await page.emulateMedia(media);
  if (initScript) await page.addInitScript(initScript);
  if (clock) await page.clock.install();
  const errors = [];
  const calls = [];
  const requests = [];   // [lat, lon] exactly as the page sent them
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(`${ORIGIN}/`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route(`${ORIGIN}/?*`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  let stanfordCalls = 0;
  await page.route('**/api/aircraft**', async (r) => {
    const q = new URL(r.request().url()).searchParams;
    const lat = +q.get('lat'), lon = +q.get('lon');
    requests.push([q.get('lat'), q.get('lon')]);
    const sjc = Math.abs(lat - 37.36) < 0.01;
    calls.push(sjc ? 'sjc' : 'stanford');
    if (!sjc && stanfordCalls++ === 0 && holdFirstStanford) await new Promise((ok) => setTimeout(ok, holdFirstStanford));
    if (sjc && holdSjc) await new Promise((ok) => setTimeout(ok, holdSjc));
    try {
      if (!sjc && failStanford()) {
        await r.fulfill({ status: 502, json: { error: 'adsb.lol returned 503' } });
      } else {
        await r.fulfill({ json: sjc ? planeNear(lat, lon, 'SWA2', 'a00002') : stanford(lat, lon, 'UAL1', 'a00001') });
      }
    } catch { /* the page cancelled this request */ }
  });
  await page.goto(`${ORIGIN}/${query}`);
  return { page, errors, calls, requests };
}

const tests = {
  async 'aircraft errors show the data source failure without page errors'(browser) {
    const { page, errors } = await open(browser, { failStanford: () => true });
    await page.waitForSelector('#status.error');
    assert.match(await page.textContent('#status'), /No answer from the data source \(adsb.lol returned 503\)/);
    assert.deepEqual(errors, []);
  },

  async 'a scheduled refresh recovers from an aircraft error'(browser) {
    let failing = true;
    const { page, errors, calls } = await open(browser, { failStanford: () => failing, clock: true });
    await page.waitForSelector('#status.error');
    failing = false;
    const callsBeforeRefresh = calls.length;
    await page.clock.fastForward(10500);
    await page.waitForSelector('#now button[data-hex="a00001"]');
    assert.ok(calls.length > callsBeforeRefresh, 'the scheduled refresh must retry aircraft');
    assert.match(await page.textContent('#status'), /^Live ·/);
    assert.equal(await page.locator('#status.error').count(), 0);
    assert.match(await page.textContent('#head'), /United Airlines 1/);
    assert.deepEqual(errors, []);
  },

  async 'switching place clears the old error while the new answer is pending'(browser) {
    const { page, errors, calls } = await open(browser, { failStanford: () => true, holdSjc: 2000 });
    await page.waitForSelector('#status.error');
    await page.selectOption('#place', 'KSJC');
    assert.equal(await page.textContent('#status'), 'Finding planes.');
    assert.equal(await page.locator('#status.error').count(), 0);
    await page.waitForTimeout(1000);
    assert.equal(await page.textContent('#status'), 'Finding planes.');
    await page.waitForSelector('#now button[data-hex="a00002"]');
    assert.deepEqual(calls.slice(0, 2), ['stanford', 'sjc']);
    assert.match(await page.textContent('#status'), /^Live ·/);
    assert.deepEqual(errors, []);
  },

  async 'shows the visible plane'(browser) {
    const { page, errors } = await open(browser);
    await page.waitForFunction(() => /1 plane you can see from Stanford/.test(document.querySelector('#title').textContent));
    assert.match(await page.textContent('#head'), /United Airlines 1/);
    assert.deepEqual(errors, []);
  },

  async 'the answer says where to look'(browser) {
    // The default fixture is placed from the rounded request (37.43, -122.17), which puts it 58°
    // up from the Main Quad. Place it from the Main Quad itself so it is exactly 60° up, due north.
    const exact = () => ({ now: Date.now(), ac: [airliner(37.4275, -122.1703, 'UAL1', 'a00001')] });
    const { page, errors } = await open(browser, { stanford: exact });
    await page.waitForSelector('#head .answer');
    assert.match(await page.textContent('#head .answer'), /^Look north, (59|60|61)° up$/);
    assert.deepEqual(errors, []);
  },

  async 'the horizon puts a plane due north at the centre'(browser) {
    const { page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } });
    const mark = page.locator('#sky [data-hex="a00001"]');
    await mark.waitFor();
    const box = await mark.boundingBox();
    const sky = await page.locator('#sky').boundingBox();
    const dx = Math.abs((box.x + box.width / 2) - (sky.x + sky.width / 2));
    assert.ok(dx <= 30, `the plane is ${dx.toFixed(1)} px from the centre`);
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

  async 'Share this plane copies the place and plane, omitting the default place'(browser) {
    for (const [query, hex, search] of [
      ['?at=KSJC', 'a00002', '?at=KSJC&plane=a00002'],
      ['', 'a00001', '?plane=a00001'],
    ]) {
      const { page, errors } = await open(browser, {
        query,
        initScript: () => {
          Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
          Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: async (text) => { window.copiedText = text; } },
            configurable: true,
          });
        },
      });
      await page.waitForSelector(`#now button[data-hex="${hex}"]`);
      const share = page.locator('#card button[data-focus="share"]');
      assert.equal(await share.textContent(), 'Share this plane');
      await share.click();
      await page.waitForFunction(() => document.querySelector('#card button[data-focus="share"]').textContent === 'Link copied');
      const url = new URL(await page.evaluate(() => window.copiedText));
      assert.equal(url.origin, ORIGIN);
      assert.equal(url.pathname, '/');
      assert.equal(url.search, search);
      if (!query) assert.equal(url.searchParams.has('at'), false);
      assert.equal(await share.textContent(), 'Link copied');
      assert.deepEqual(errors, []);
      await page.close();
    }
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

  // States (docs/redesign-2026-11.md §5.5).
  async 'loading shows the horizon before data arrives'(browser) {
    const { page, errors } = await open(browser, { holdFirstStanford: 3000 });
    await page.waitForFunction(() => document.querySelector('#head .answer')?.textContent === 'Listening for planes…', null, { timeout: 1000 });
    await page.waitForFunction(() => [...document.querySelectorAll('#sky text')].some((t) => t.textContent === 'N'), null, { timeout: 1000 });
    assert.equal(await page.textContent('#status'), 'Connecting to adsb.lol');
    assert.equal(await page.locator('#head .sub').count(), 0);
    assert.equal(await page.textContent('#now'), 'Waiting for the first update.');
    assert.deepEqual(errors, []);
  },

  async 'quiet sky when nothing is in range'(browser) {
    const { page, errors } = await open(browser, { stanford: () => ({ now: Date.now(), ac: [] }) });
    await page.waitForFunction(() => /^Live/.test(document.querySelector('#status').textContent));
    assert.equal(await page.textContent('#head .answer'), 'No planes in range right now.');
    assert.equal(await page.locator('#head .sub').count(), 0);
    assert.equal(await page.isHidden('#more'), true);
    assert.equal(await page.textContent('#next'), 'Nothing on course to come into view in the next 10 minutes.');
    assert.deepEqual(errors, []);
  },

  async 'quiet sky counts the planes in range that are too low'(browser) {
    const low = (lat, lon) => ({ now: Date.now(), ac: [{ ...airliner(lat, lon, 'UAL1', 'a00001', 3), gs: 0, track: 0 }] });
    const { page, errors } = await open(browser, { stanford: low });
    await page.waitForFunction(() => /^Live/.test(document.querySelector('#status').textContent));
    assert.equal(await page.textContent('#head .answer'), 'Quiet sky. 1 plane in range, none high or close enough to see.');
    assert.equal(await page.isHidden('#more'), true);
    assert.deepEqual(errors, []);
  },

  async 'nothing visible but one coming'(browser) {
    const coming = (lat, lon) => ({ now: Date.now(), ac: [{ ...airliner(lat, lon, 'UAL9', 'a00009', 5), track: 180, gs: 450 }] });
    const { page, errors } = await open(browser, { stanford: coming });
    await page.waitForSelector('#next button[data-hex="a00009"]');
    assert.match(await page.textContent('#head .answer'), /^Nothing to see this second\. Next: United Airlines 9 in \d+ min/);
    assert.equal(await page.getAttribute('#next button[data-hex="a00009"]', 'aria-current'), 'true');
    assert.deepEqual(errors, []);
  },

  async 'an error keeps the last planes'(browser) {
    let failing = false;
    const { page, errors } = await open(browser, { failStanford: () => failing, clock: true });
    await page.waitForSelector('#now button[data-hex="a00001"]');
    assert.equal(await page.locator('#status.live').count(), 1);
    failing = true;
    await page.clock.fastForward(10500);
    await page.waitForSelector('#status.error');
    assert.equal(await page.textContent('#status'), 'No answer from the data source (adsb.lol returned 503). Retrying every 10 s.');
    assert.equal(await page.locator('#status.live').count(), 0);
    assert.equal(await page.locator('#now button[data-hex="a00001"]').count(), 1);
    assert.match(await page.textContent('#head .answer'), /^Look north/);
    assert.equal(await page.locator('.pano.stale').count(), 0);
    assert.deepEqual(errors, []);
  },

  async 'planes fade after 30 s without fresh data'(browser) {
    let failing = false;
    const { page, errors } = await open(browser, { failStanford: () => failing, clock: true });
    await page.waitForSelector('#now button[data-hex="a00001"]');
    failing = true;
    await page.clock.fastForward(10500);
    await page.waitForSelector('#status.error');
    await page.clock.fastForward(21000);
    await page.waitForSelector('.pano.stale');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#sky .planes')).opacity), '0.5');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#sky > g')).opacity), '1');
    failing = false;
    await page.clock.fastForward(10500);
    await page.waitForSelector('#status.live');
    assert.equal(await page.locator('.pano.stale').count(), 0);
    assert.deepEqual(errors, []);
  },

  async 'an error before any data says so and draws the grid only'(browser) {
    const { page, errors } = await open(browser, { failStanford: () => true });
    await page.waitForSelector('#status.error');
    assert.equal(await page.textContent('#head .answer'), 'Can\'t reach the plane data right now.');
    assert.equal(await page.locator('#sky text', { hasText: /^N$/ }).count(), 0);
    assert.ok(await page.locator('#sky line').count() > 0, 'the grid is drawn');
    assert.equal(await page.locator('#now li, #next li').count(), 0);
    assert.deepEqual(errors, []);
  },

  // Motion, accessibility and performance (docs/redesign-2026-11.md §4.4, §5.6, §5.7).
  async 'the 1 s tick moves planes without rebuilding the chart'(browser) {
    const { page, errors } = await open(browser, { clock: true });
    const mark = '#sky [data-hex="a00001"]';
    await page.waitForSelector(mark);
    const before = await page.evaluate((sel) => {
      window.skyMutations = 0;
      window.skyObserver = new MutationObserver((records) => { window.skyMutations += records.length; });
      window.skyObserver.observe(document.querySelector('#sky'), { childList: true, subtree: true });
      // Count the expensive calls the tick must never make.
      window.costly = { getBBox: 0, measureText: 0, replaceChildren: 0 };
      for (const [proto, name] of [[SVGGraphicsElement.prototype, 'getBBox'], [CanvasRenderingContext2D.prototype, 'measureText'], [Element.prototype, 'replaceChildren']]) {
        const original = proto[name];
        proto[name] = function (...args) { if (this === document.querySelector('#sky') || name !== 'replaceChildren') window.costly[name]++; return original.apply(this, args); };
      }
      return document.querySelector(sel).style.transform;
    }, mark);
    await page.clock.fastForward(2500);
    const after = await page.evaluate((sel) => {
      window.skyMutations += window.skyObserver.takeRecords().length;
      window.skyObserver.disconnect();
      return { mutations: window.skyMutations, costly: window.costly, transform: document.querySelector(sel).style.transform };
    }, mark);
    assert.equal(after.mutations, 0, 'the tick must not add or remove nodes in #sky');
    assert.deepEqual(after.costly, { getBBox: 0, measureText: 0, replaceChildren: 0 });
    assert.match(before, /^translate\([\d.]+px, [\d.]+px\) rotate\(-?\d+deg\)$/);
    assert.notEqual(after.transform, before, 'the plane must move');
    assert.equal(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).transitionDuration, mark), '1s');
    assert.deepEqual(errors, []);
  },

  async 'reduced motion turns off transitions'(browser) {
    const { page, errors } = await open(browser, { media: { reducedMotion: 'reduce' } });
    await page.waitForSelector('#sky [data-hex="a00001"]');
    for (const sel of ['#sky [data-hex="a00001"]', '#sky .ring', '#now button']) {
      assert.equal(await page.evaluate((s) => getComputedStyle(document.querySelector(s)).transitionDuration, sel), '0s', sel);
    }
    assert.deepEqual(errors, []);
  },

  async 'the selection ring fades in once'(browser) {
    const { page, errors } = await open(browser);
    await page.waitForSelector('#sky .ring');
    const ring = () => page.evaluate(() => {
      const r = document.querySelector('#sky .ring');
      return { opacity: r.style.opacity, transition: getComputedStyle(r).transition };
    });
    assert.deepEqual(await ring(), { opacity: '1', transition: 'opacity 0.15s ease-out' });
    assert.deepEqual(errors, []);
  },

  async 'faint dots are capped at 80, nearest first'(browser) {
    // 80 low planes to the north and 20 further ones to the south; none can be seen or will be.
    const crowd = (lat, lon) => ({ now: Date.now(), ac: Array.from({ length: 100 }, (_, i) => {
      const far = i >= 80, km = (far ? 80 : 40) + i * 0.1;
      return { ...airliner(lat, lon, `LOW${i}`, `b${String(i).padStart(5, '0')}`), lat: lat + (far ? -km : km) / 111.195, gs: 0 };
    }) });
    const { page, errors } = await open(browser, { stanford: crowd, viewport: { width: 1440, height: 900 } });
    await page.waitForFunction(() => document.querySelectorAll('#sky .dot').length > 0);
    const xs = await page.evaluate(() => [...document.querySelectorAll('#sky .dot')].map((d) => parseFloat(d.style.transform.slice(10))));
    const W = await page.evaluate(() => document.querySelector('#sky').viewBox.baseVal.width);
    assert.equal(xs.length, 80);
    assert.ok(xs.every((x) => Math.abs(x - W / 2) < W / 8), 'only the 80 nearest (north) planes are drawn');
    assert.deepEqual(errors, []);
  },

  async 'the panorama stays under 400 nodes with 60 aircraft'(browser) {
    const sixty = (lat, lon) => ({ now: Date.now(), ac: Array.from({ length: 60 }, (_, i) => ({
      ...airliner(lat, lon, `UAL${i}`, `c${String(i).padStart(5, '0')}`, i < 20 ? 15 + i * 3 : 4 + (i % 5)), track: i * 6,
    })) });
    const { page, errors } = await open(browser, { stanford: sixty, viewport: { width: 1440, height: 900 } });
    await page.waitForFunction(() => document.querySelectorAll('#now button').length >= 20);
    const nodes = await page.evaluate(() => document.querySelectorAll('#sky *').length);
    assert.ok(nodes <= 400, `${nodes} nodes in #sky`);
    assert.deepEqual(errors, []);
  },

  async 'keyboard path, focus ring and labels'(browser) {
    const { page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } });
    await page.waitForSelector('#now button[data-hex="a00001"]');
    assert.equal(await page.locator('#sky [data-hex]:not([tabindex="-1"])').count(), 0, 'plane glyphs are not tab stops');
    assert.equal(await page.getAttribute('.pano', 'tabindex'), '0');
    assert.equal(await page.getAttribute('.pano', 'aria-label'), 'Horizon, scroll sideways');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'place');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return [document.activeElement.className, s.outlineStyle, s.outlineWidth, s.outlineOffset];
    });
    assert.deepEqual(ring, ['pano', 'solid', '2px', '2px']);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.focus), 'now-a00001');
    assert.match(await page.getAttribute('#now button', 'aria-label'), /^United Airlines 1, visible now, \d+ degrees up, north, /);
    assert.deepEqual(errors, []);
  },

  async 'text at 200% causes no horizontal page scroll at 1440 px'(browser) {
    const { page, errors } = await open(browser, {
      viewport: { width: 1440, height: 900 },
      initScript: () => document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = 'html { font-size: 200% }';
        document.head.append(s);
      }),
    });
    await page.waitForSelector('#now button[data-hex="a00001"]');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.head .answer')).fontSize), '80px');
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw, `page is ${sw} px wide in a ${cw} px window`);
    assert.deepEqual(errors, []);
  },

  async 'without JavaScript the page says it needs it'(browser) {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route(`${ORIGIN}/`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(`${ORIGIN}/`);
    assert.equal(await page.textContent('#head .answer'), 'skyviu needs JavaScript to fetch live plane positions.');
    assert.equal(await page.isVisible('#head .answer'), true);
    for (const sel of ['#status', '.pano', '.timeline']) assert.equal(await page.isHidden(sel), true, `${sel} is hidden`);
    await context.close();
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

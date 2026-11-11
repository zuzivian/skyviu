// Unit tests for the two Vercel edge proxies in api/. No network: fetch is stubbed.
// Run: node test/api.mjs   (not wired into `npm test` or CI)
import assert from 'node:assert/strict';
import aircraft from '../api/aircraft.mjs';
import orbits from '../api/orbits.mjs';

const realFetch = globalThis.fetch;
const get = (qs) => new Request(`http://skyviu.test/api/aircraft${qs}`);

// Stub the upstream for one case. `reply` is a Response, or a function that throws.
async function withUpstream(reply, run) {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return typeof reply === 'function' ? reply() : reply;
  };
  try { await run(urls); } finally { globalThis.fetch = realFetch; }
}
const boom = () => { throw new Error('network down'); };

const tests = {
  async 'aircraft: missing or out-of-range lat/lon is 400 with {error}'() {
    for (const qs of ['', '?lat=37.4', '?lon=-122.1', '?lat=91&lon=-122.1', '?lat=37.4&lon=181']) {
      await withUpstream(new Response('{}'), async (urls) => {
        const res = await aircraft.fetch(get(qs));
        assert.equal(res.status, 400, qs);
        assert.equal(typeof (await res.json()).error, 'string', qs);
        assert.equal(urls.length, 0, `${qs} must not reach upstream`);
      });
    }
  },

  async 'aircraft: rounds to 2 decimals, clamps nm to 1..25, caches 10 s'() {
    const body = '{"ac":[]}';
    for (const [nm, want] of [['999', 25], ['', 25], ['10', 10], ['0.2', 1], ['-5', 1]]) {
      await withUpstream(new Response(body), async (urls) => {
        const res = await aircraft.fetch(get(`?lat=37.42749&lon=-122.17031${nm === '' ? '' : `&nm=${nm}`}`));
        assert.equal(res.status, 200);
        assert.equal(urls[0], `https://api.adsb.lol/v2/point/37.43/-122.17/${want}`, `nm=${nm || '(absent)'}`);
        assert.equal(await res.text(), body);
        assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=10');
      });
    }
  },

  async 'aircraft: upstream throws or non-2xx is 502 with {error}'() {
    for (const reply of [boom, new Response('nope', { status: 500 }), new Response('nope', { status: 404 })]) {
      await withUpstream(reply, async () => {
        const res = await aircraft.fetch(get('?lat=37.4&lon=-122.1'));
        assert.equal(res.status, 502);
        assert.equal(typeof (await res.json()).error, 'string');
      });
    }
  },

  async 'orbits: keeps only NORAD 25544 and 48274, caches 2 h'() {
    const all = [25544, 12345, 48274, 99999].map((id) => ({ NORAD_CAT_ID: id, OBJECT_NAME: `obj${id}` }));
    await withUpstream(Response.json(all), async () => {
      const res = await orbits.fetch();
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=7200');
      const { objects } = await res.json();
      assert.deepEqual(objects.map((o) => o.NORAD_CAT_ID), [25544, 48274]);
    });
  },

  async 'orbits: upstream throws, non-200 or non-array gives {error, objects: []}, caches 15 min'() {
    for (const reply of [boom, new Response('busy', { status: 403 }), Response.json({ not: 'an array' }), new Response('not json')]) {
      await withUpstream(reply, async () => {
        const res = await orbits.fetch();
        assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=900');
        const json = await res.json();
        assert.equal(typeof json.error, 'string');
        assert.deepEqual(json.objects, []);
      });
    }
  },
};

let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try { await run(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`); }
}
process.exit(failed ? 1 : 0);

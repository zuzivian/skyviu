// Unit tests for the Vercel edge proxy in api/. No network: fetch is stubbed.
// Run: node test/api.mjs (also runs first in `npm test` and CI).
import assert from 'node:assert/strict';
import aircraft from '../api/aircraft.mjs';

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

  async 'aircraft: blank coordinates are 400 without an upstream call'() {
    for (const qs of ['?lat=%20&lon=-122.1', '?lat=37.4&lon=%20', '?lat=&lon=', '?lat=%20&lon=%20']) {
      await withUpstream(new Response('{"ac":[]}'), async (urls) => {
        const res = await aircraft.fetch(get(qs));
        assert.equal(res.status, 400, qs);
        assert.equal(typeof (await res.json()).error, 'string', qs);
        assert.equal(urls.length, 0, `${qs} must not reach upstream`);
      });
    }
  },

  async 'aircraft: malformed JSON or invalid aircraft data is 502'() {
    for (const body of ['<html>oops</html>', '{"now":1}', 'null', '[]', '42', '{"ac":{}}', '{"ac":null}']) {
      await withUpstream(new Response(body), async () => {
        const res = await aircraft.fetch(get('?lat=37.4&lon=-122.1'));
        assert.equal(res.status, 502, body);
        assert.deepEqual(await res.json(), { error: 'adsb.lol sent something unexpected' }, body);
      });
    }
  },

  async 'aircraft: valid aircraft JSON keeps its original formatting and cache headers'() {
    const body = ' { "now": 1, "ac": [] }\n';
    await withUpstream(new Response(body), async () => {
      const res = await aircraft.fetch(get('?lat=37.4&lon=-122.1'));
      assert.equal(res.status, 200);
      assert.equal(await res.text(), body);
      assert.equal(res.headers.get('Content-Type'), 'application/json');
      assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=10');
    });
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
};

let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try { await run(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`); }
}
process.exit(failed ? 1 : 0);

// Pure geometry tests, with no browser, dependencies or network.
// Run: node test/astro.mjs [path/to/index.html]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const functionNames = ['geo', 'project', 'elevation', 'compassWord', 'compassShort', 'apart', 'sight', 'sunAt'];
const constantNames = ['EARTH_M', 'MIN_EL', 'MIN_ARCMIN', 'NIGHT_MI', 'NIGHT_SMALL_MI', 'SUN_CLEAR', 'M_PER_MI', 'ARCMIN_PER_RAD', 'SPAN_M', 'SMALL'];

// These helpers have balanced braces (including their template interpolations).
// Extract declarations only: evaluating the whole page would need a DOM.
function functionSource(source, name) {
  const match = new RegExp(`\\bfunction ${name}\\s*\\(`).exec(source);
  assert.ok(match, `Missing function ${name}`);
  const opening = source.indexOf('{', match.index);
  let depth = 0;
  for (let i = opening; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(match.index, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function loadHelpers() {
  const source = readFileSync(process.argv[2] || new URL('../index.html', import.meta.url), 'utf8');
  const constants = constantNames.map((name) => {
    const match = new RegExp(`\\bconst ${name}\\s*=\\s*[^;]+;`).exec(source);
    assert.ok(match, `Missing constant ${name}`);
    return match[0];
  });
  return runInNewContext(`
    const rad = (d) => d * Math.PI / 180;
    const deg = (r) => r * 180 / Math.PI;
    const wrap = (d) => ((d % 360) + 360) % 360;
    ${constants.join('\n')}
    ${functionNames.map((name) => functionSource(source, name)).join('\n')}
    ({ ${[...constantNames, ...functionNames].join(', ')} });
  `, {}, { timeout: 1000 });
}

let helpers;
try { helpers = loadHelpers(); }
catch (e) { console.log(`FAIL load helpers: ${e.message}`); process.exit(1); }
const { geo, project, elevation, compassWord, compassShort, apart, sight, sunAt,
  MIN_EL, MIN_ARCMIN, NIGHT_MI, NIGHT_SMALL_MI, SUN_CLEAR, M_PER_MI,
  ARCMIN_PER_RAD, SPAN_M, SMALL } = helpers;
const near = (actual, expected, tolerance) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};
const observer = { lat: 37.4275, lon: -122.1703 };
const day = { az: 180, el: 40 };
const night = { az: 180, el: -7 };

const tests = {
  'geo: one degree north and coincident points'() {
    const north = geo(observer, 38.4275, observer.lon);
    near(north.d, 111195, 1);
    near(north.brg, 0, 1e-9);
    assert.equal(geo(observer, observer.lat, observer.lon).d, 0);
  },
  'project: geo round-trips distances and bearings, including across the date line'() {
    for (const origin of [observer, { lat: -33, lon: 179.9 }]) {
      for (const bearing of [0, 45, 90, 180, 270, 359.9]) {
        for (const distance of [100, 10000, 100000]) {
          const point = project(origin.lat, origin.lon, bearing, distance);
          const result = geo(origin, point.lat, point.lon);
          near(result.d, distance, 1);
          near(result.brg, bearing, 1e-6);
        }
      }
    }
  },
  'elevation: curvature, overhead and below the horizon'() {
    near(elevation(10000, 10000), 44.98, 0.01);
    assert.equal(elevation(0, 10000), 90);
    assert.ok(elevation(10000, 0) < 0);
  },
  'compassWord and compassShort: sectors and north wraparound'() {
    for (const [bearing, word, short] of [
      [0, 'north', 'N'], [44, 'northeast', 'NE'], [46, 'northeast', 'NE'],
      [90, 'east', 'E'], [135, 'southeast', 'SE'], [180, 'south', 'S'],
      [225, 'southwest', 'SW'], [270, 'west', 'W'], [315, 'northwest', 'NW'],
      [359.9, 'north', 'N'],
    ]) {
      assert.equal(compassWord(bearing), word);
      assert.equal(compassShort(bearing), short);
    }
  },
  'apart: zenith, identical and opposite directions'() {
    near(apart(0, 90, 180, 0), 90, 1e-9);
    near(apart(0, 0, 0, 0), 0, 1e-9);
    near(apart(0, 0, 180, 0), 180, 1e-9);
  },
  'sight: too low, and inclusive elevation cutoff'() {
    const low = sight(MIN_EL - 0.01, 100, 0, 'A3', day);
    assert.equal(low.ok, false);
    assert.match(low.why, /Too low/);
    assert.equal(sight(MIN_EL, 100, 0, 'A3', day).ok, true);
    // Fixed regression fixture: raising MIN_EL to 20 must reject this case.
    assert.equal(sight(15, 100, 0, 'A3', day).ok, true);
  },
  'sight: sun glare, clear sky and sun below horizon'() {
    const glare = sight(40, 100, 0, 'A3', { az: 0, el: 40 });
    assert.equal(glare.ok, false);
    assert.match(glare.why, /glare/);
    assert.equal(sight(40, 100, 0, 'A3', { az: 0, el: 40 + SUN_CLEAR + 1 }).ok, true);
    assert.equal(sight(MIN_EL, 100, 0, 'A3', { az: 0, el: 0 }).ok, true);
  },
  'sight: small, large and unknown categories have inclusive night ranges'() {
    assert.ok(SMALL.has('A1') && !SMALL.has('A5'));
    for (const [cat, miles] of [['A1', NIGHT_SMALL_MI], ['A5', NIGHT_MI], ['unknown', NIGHT_SMALL_MI]]) {
      const limit = miles * M_PER_MI;
      for (const distance of [limit - 1, limit]) {
        const visible = sight(40, distance, 0, cat, night);
        assert.equal(visible.ok, true, cat);
        assert.equal(visible.lights, true, cat);
      }
      const far = sight(40, limit + 1, 0, cat, night);
      assert.equal(far.ok, false, cat);
      assert.match(far.why, /Too far/);
    }
  },
  'sight: daylight size cutoff, fallback wingspan and civil twilight'() {
    for (const cat of ['A1', 'A5', 'unknown']) {
      const span = SPAN_M[cat] || SPAN_M.A1;
      const limit = span * ARCMIN_PER_RAD / MIN_ARCMIN;
      const visible = sight(40, limit * 0.99, 0, cat, day);
      assert.equal(visible.ok, true);
      assert.equal(visible.lights, undefined);
      near(visible.arcmin, span / (limit * 0.99) * ARCMIN_PER_RAD, 1e-9);
      const small = sight(40, limit * 1.01, 0, cat, day);
      assert.equal(small.ok, false);
      assert.match(small.why, /Too small/);
    }
    const distance = NIGHT_SMALL_MI * M_PER_MI;
    assert.equal(sight(40, distance, 0, 'A1', { az: 180, el: -6 }).ok, false);
    assert.equal(sight(40, distance, 0, 'A1', { az: 180, el: -6.01 }).ok, true);
  },
  'sunAt: Stanford summer noon'() {
    const sun = sunAt(new Date('2026-06-21T20:10:00Z'), observer.lat, observer.lon);
    near(sun.az, 179.9, 0.5);
    near(sun.el, 76.0, 0.5);
  },
  'sunAt: equatorial equinox noon and midnight'() {
    assert.ok(sunAt(new Date('2026-03-20T12:07:00Z'), 0, 0).el > 89);
    assert.ok(sunAt(new Date('2026-03-20T00:07:00Z'), 0, 0).el < -89);
  },
};

let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`); }
}
process.exit(failed ? 1 : 0);

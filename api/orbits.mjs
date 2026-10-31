// Tiny proxy for CelesTrak's space station orbits. The browser can't call CelesTrak directly
// (no CORS header), and CelesTrak asks that each update, every 2 hours, be fetched only once.
// So this makes one fixed request and Vercel's CDN shares the answer with every visitor.
const UPSTREAM = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=JSON';
const KEEP = new Set([25544, 48274]);   // ISS (Zarya) and China's Tiangong (Tianhe core)

export default {
  async fetch() {
    // On any failure, cache the error for 15 minutes too, so a struggling CelesTrak isn't asked
    // again by every visitor. CelesTrak asks clients to stop on any non-200 answer.
    const fail = (error) => Response.json({ error, objects: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=900' },
    });
    let upstream;
    try {
      upstream = await fetch(UPSTREAM, { signal: AbortSignal.timeout(8000) });
    } catch {
      return fail('CelesTrak did not answer');
    }
    if (upstream.status !== 200) return fail(`CelesTrak returned ${upstream.status}`);
    const all = await upstream.json().catch(() => null);
    if (!Array.isArray(all)) return fail('CelesTrak sent something unexpected');
    return Response.json({ objects: all.filter((o) => KEEP.has(o.NORAD_CAT_ID)) }, {
      headers: { 'Cache-Control': 'public, s-maxage=7200' },
    });
  },
};

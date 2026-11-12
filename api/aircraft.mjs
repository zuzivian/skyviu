// Tiny proxy for adsb.lol. The browser can't call adsb.lol directly (no CORS
// header), so the page calls /api/aircraft and this forwards one fixed request.
const UPSTREAM = 'https://api.adsb.lol/v2/point';
const MAX_NM = 25;

export default {
  async fetch(request) {
    const q = new URL(request.url).searchParams;
    const lat = Number(q.get('lat'));
    const lon = Number(q.get('lon'));
    const nm = Math.min(Math.max(Number(q.get('nm')) || MAX_NM, 1), MAX_NM);
    if (!q.get('lat')?.trim() || !q.get('lon')?.trim() || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    // Rounding to 2 decimals (about 1 km) keeps the cache small and means
    // nobody's exact location is passed on.
    const url = `${UPSTREAM}/${lat.toFixed(2)}/${lon.toFixed(2)}/${Math.round(nm)}`;
    let upstream;
    try {
      upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      return Response.json({ error: 'adsb.lol did not answer' }, { status: 502 });
    }
    if (!upstream.ok) {
      return Response.json({ error: `adsb.lol returned ${upstream.status}` }, { status: 502 });
    }

    let text;
    try {
      text = await upstream.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !Array.isArray(data.ac)) {
        return Response.json({ error: 'adsb.lol sent something unexpected' }, { status: 502 });
      }
    } catch {
      return Response.json({ error: 'adsb.lol sent something unexpected' }, { status: 502 });
    }

    // s-maxage lets Vercel's CDN share one copy per area for 10 seconds,
    // so upstream calls grow with time, not with visitors.
    return new Response(text, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=10' },
    });
  },
};

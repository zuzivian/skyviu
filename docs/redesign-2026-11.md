# skyviu redesign brief (2026-11)

Status: proposed. The owner's verdict on the current design is "horrible". This brief starts
from first principles and is the spec for the redesign issues. The implementer can't see the
page, so every value an implementer needs is written down here. Where this brief and the code
disagree, the brief wins. Where the brief says nothing, keep what the code does now.

---

## 1. Purpose and user

**Who opens this.** Someone standing outside at Stanford, or about to step outside, who heard a
plane or saw a light and wants to know *where to look and what it is*. Usually it's a phone, held
in one hand, outdoors: in daylight with glare, or at night with eyes adjusting to the dark. The
second user is someone at a desk who opened a shared link (`?plane=`) and wants to see the same
plane.

**What they don't want.** A flight tracker. Flightradar24 already exists and does maps, routes
and history better than one HTML file ever will. skyviu's only edge is the question it answers:
*of the planes up there, which can my eyes actually pick out from where I stand, and where do I
turn my head?*

**The one job of the first screen:** tell me, in one line I can read at arm's length, which way to
face and how high to look for the easiest plane to see right now, and show it in a picture shaped
like my view.

Everything on the first screen serves that job: the direction and angle, the plane's name, and a
picture of the horizon. Anything else goes below or gets cut.

---

## 2. Teardown of the current site

Screenshots were taken at 1440x900 and 390x844 with a 13-aircraft fixture, because the sandbox
couldn't reach adsb.lol.

**The page is a document, not an instrument.** It is a 720 px text column centred on a 1440 px
screen, so half the desktop is empty white. It reads like a blog post: a byline, a serif H1, a
grey status line, then a stack of H2 sections ("Planes you can see now", "Also in the sky", "Next
planes to come into view"), each with a list of grey rows. On a phone outdoors, the one thing you
need (which way to look) is a 14 px compass glyph squeezed beside the plane's name.

**The headline answers the wrong question.** "7 planes you can see from Stanford" is a count.
Nobody acts on a count. The status line under it then says the same thing again ("Live · 7 of 12
planes within 29 miles").

**The sky chart is a radar map pretending to be a sky.** It's a polar plot with overhead in the
middle and the horizon at the rim. Two problems:
- **Most planes you can see sit 10–30° up**, and this projection squeezes exactly that band into
  the outer third of the radius. In the screenshot every visible plane is crowded against the
  rim, while the middle 60% of the circle (30–90°) is empty apart from the word "Overhead".
- **You have to translate it in your head.** To use it you rotate a map until its N matches the
  real north, then work out that "close to the rim" means "low". A person's real view is a
  horizon in front of them with sky above it, and the chart doesn't look like that.

**No visual hierarchy.** Every mark is the same blue arrow. Planes you can see, the selected
plane, the projected path and every label share one accent colour. Unlabelled arrows (labels stop
at 5) are anonymous. The sun is a hollow black circle that looks like the selection ring. The
fixed labels ("Overhead", "Horizon", "30°", "60°") collide with plane paths and the rim. The chart
sits in a bordered, rounded box, so a circle is framed inside a square for no reason.

**Typography is defaulted, not designed.** It's Fraunces plus Inter, the default pairing of
agent-made pages. Nearly everything is 16 px: body, labels, metadata, legend and chart text.
Hierarchy comes only from the serif headings, and the serif headings ("Southwest Airlines 2207")
read as an article title, not a flight.

**Every row says too much in words.** "looks about 1/6 as wide as the moon" repeats on every row.
"30° up SE · 6,500 ft · looks about as wide as the moon" is three facts in one grey run-on
string. The picture should carry the size, and the row should carry the time, the direction and
how hard the plane is to spot.

**Features fight for the first screen.** A QR code ("Scan, then point your phone up") takes the
top-right of the desktop view. A "Point your phone at the sky" camera button, a place `<select>`
truncated to "Stanford Main Q" on mobile, and a "Show all 12 in range" toggle compete with the
answer. "Also in the sky" spends a full section in daylight to say "Nothing else right now".

**Over-built, under-designed.** The 95 KB file includes an SGP4 satellite propagator, a
device-orientation AR camera with sun alignment and a wake lock, a planet ephemeris, a QR code
and a hand-placed label collision system. The visual layer is three CSS colours and a border.
The engineering is careful, but the product has no point of view.

**Night is ignored.** The page is a white page at full brightness. At night, the time planes are
easiest to see by their lights, it destroys the user's dark adaptation the moment they look down.

What's worth keeping: the visibility model (`sight()`, `judge()`), the plane-projection and
geometry code, the proxy and its privacy rounding, the deep links, the focus-preservation
pattern, the "If each plane flies straight" honesty, the "How it decides" copy, and the tests.

---

## 3. Concept: the Horizon

**One direction: a 360° panorama of your horizon, read like standing up and turning around.**

The main view is a wide strip. Across it is compass bearing: north in the centre, east to the
right, west to the left, south at both edges. That's what you see facing north: east really is on
your right. Up it is elevation: the horizon at the bottom, overhead at the top. Each plane is a
small silhouette at the spot where it is in your sky, sized by how big it looks from where you
stand. Real landmarks sit on the horizon line ("SFO", "San Jose", "The Dish", "Mt Diablo"), so
you can orient without a compass. Above it all, one sentence: **"Look north-northwest, 17° up."**

Why this and not the alternatives:

| Option | Verdict |
|---|---|
| **Sky dome (polar), redesigned** | Cut. It squeezes the 10–30° band where most visible planes are, and it needs a mental flip (looking up mirrors east and west). Polishing it keeps both problems. |
| **AR camera view** | Cut. It needs a camera permission, a motion permission on iOS, and a compass that drifts. The user then has to line up on the sun to fix it. It fails exactly when people use it (at night there's no sun to align on). That's a big cost for a demo moment. |
| **Map with planes** | Cut. That's Flightradar24. It answers "where is the plane", not "where do I look". |
| **Horizon panorama** | **Chosen.** It's shaped like the view: turning your body is x, tilting your head is y. Its elevation scale can give the 10–30° band most of the height. Landmarks orient you without sensors. It's wide, so it fills desktop, and on mobile it scrolls sideways the way your head turns. |

Three ideas carry the concept:

1. **Visible now vs overhead soon.** One timeline, not three lists. Planes you can see now are
   filled amber silhouettes. Planes that come into view within 10 minutes are dashed blue
   outlines with a "4 min" tag. Planes in range that you can't see are faint dots, so the sky
   never looks falsely empty, with no toggle needed.
2. **Size means spot-ability.** The silhouette's size comes from its apparent wingspan
   (`see.arcmin`). This replaces "looks about 1/6 as wide as the moon" on every row with a
   picture, plus a one-word grade: EASY, FAIR, HARD, or LIGHTS at night.
3. **The page matches the sky.** Dark theme whenever the sun is below −6° at the observer (civil
   twilight), or when the OS asks for dark. Light theme only in daylight with a light OS
   preference. Amber, the colour of aircraft lights, is the one saturated colour, so the night
   page doesn't wreck night vision.

Anti-tropes, as rules: no gradient hero, no illustration, no emoji, no card grid, no drop
shadows, no rounded "feature" boxes, no marketing copy. One hairline-ruled list, one picture and
one sentence. Chrome text is small, uppercase and monospaced, like instrument labels.

---

## 4. Design system tokens

All tokens live as CSS custom properties on `:root` in `index.html`'s `<style>`. JavaScript that
draws SVG must use `var(--token)` in `fill`/`stroke`, never hex literals, so both themes work
without a redraw.

### 4.1 Type

Fonts:
- **Text:** system UI stack, which costs zero bytes and is native on phones outdoors:
  `--font-text: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;`
- **Data and chrome:** **B612 Mono** from Google Fonts (weight 400 only). Airbus designed B612
  for cockpit displays: very legible numerals and a distinct 0/O. It's used for numbers,
  bearings, times and uppercase labels.
  `--font-data: "B612 Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;`
- Load it with exactly:
  `<link href="https://fonts.googleapis.com/css2?family=B612+Mono&display=swap" rel="stylesheet">`
  (keep the two `preconnect` links). Delete Fraunces and Inter.

Scale (px, line height). Use the token names in the CSS:

| Token | Size / line | Font | Use |
|---|---|---|---|
| `--fs-label` | 12 / 16 | data, uppercase, `letter-spacing: .08em` | chrome labels, compass letters, column heads, kicker |
| `--fs-data` | 14 / 20 | data | numbers in rows: `17° NW`, `6,500 ft`, `4 MIN` |
| `--fs-body` | 16 / 24 | text 400 | body copy, row names, detail values |
| `--fs-lead` | 20 / 28 | text 400 | answer sub-line (name · type · altitude) |
| `--fs-answer` | 40 / 44 desktop, 28 / 32 under 640 px | text 700, `letter-spacing: -.01em` | the "Look …" sentence |

Weights: 400 and 700 only. There are no other sizes in HTML. Inside the SVG, compass letters and
gridline labels use `--fs-label`. Two SVG-only sizes are the exceptions: 13 px text-font for plane
callsigns, and 11 px text-font for landmark and planet names.

### 4.2 Colour

Each colour has one meaning. Amber means "you can see it". Blue means "soon". Nothing else is
saturated.

| Token | Light (day) | Dark (night) | Meaning |
|---|---|---|---|
| `--bg` | `#F3F5F7` | `#0A0E13` | page |
| `--raised` | `#FFFFFF` | `#111821` | header bar and the panorama's below-10° band only |
| `--line` | `#D3DAE2` | `#233041` | hairlines and gridlines |
| `--text` | `#0D1520` | `#E8EEF4` | primary text |
| `--muted` | `#56626F` | `#8D9BAB` | secondary text, compass letters, horizon line |
| `--visible` | `#A34F00` | `#FFB547` | planes you can see, selection ring, NOW tag |
| `--soon` | `#0A64B8` | `#6CC4FF` | planes coming into view, "4 MIN" tag |
| `--faint` | `#9AA6B3` | `#4A5869` | planes in range you can't see. Never used for text. |
| `--sun` | `#B07A00` | `#FFD98A` | the sun and its glare zone outline |
| `--error` | `#B3261E` | `#FF7A6B` | error text and its dot |
| `--below` | `rgba(13,21,32,.05)` | `rgba(232,238,244,.03)` | fill of the 0–10° "tree line" band |

Measured contrast, against `--bg` / `--raised`: in light, text 16.8, muted 5.7, visible 5.2,
soon 5.5, error 6.0. In dark, text 16.6, muted 6.8, visible 11.0, soon 10.1, error 7.6. All text
pairs pass WCAG AA (4.5:1). `--sun` is a graphic, at 3.4:1 or better (passes 3:1 for
non-text). `--faint` marks planes that can't be seen by definition, so they are decorative and
are also excluded from the accessible name.

Theme selection: put the light values in `:root`, and the dark values in a
`:root[data-theme="dark"]` block. In JS, set
`document.documentElement.dataset.theme = (matchMedia('(prefers-color-scheme: dark)').matches || state.sun.el < -6) ? 'dark' : 'light'`
on every `render()`. Set `color-scheme` to match. No toggle and no stored preference.

### 4.3 Spacing, radii, lines

- Spacing scale, 4 px base: `--s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px;
  --s6: 32px; --s7: 48px; --s8: 64px`. Use only these.
- Page gutter: `--s6` (32 px) at ≥ 640 px, `--s4` (16 px) below.
- Radii: `--r0: 0` (default for everything, including panels and the panorama), `--r1: 2px`
  (buttons, select, focus ring). Nothing rounder. No pills, no circles except plane rings.
- Lines: 1 px `--line` hairlines only. No borders around sections. No box shadows anywhere.
- Hit targets: at least 44x44 px. Each plane glyph gets a transparent 44 px circle behind it.

### 4.4 Motion

- **Planes glide.** Each 1 s tick moves glyphs with `transition: transform 1s linear` on the
  glyph `<g>`. Set the position through the `transform` *attribute* as now, plus a CSS
  `transform` style. The implementer must use the style, because CSS transitions don't apply to
  SVG attributes. So the panorama is not rebuilt each second. It's updated in place by
  `data-hex`.
- **Selection:** the ring fades in over 150 ms with `ease-out`. On mobile the strip scrolls to
  centre the selected plane with `scrollTo({ behavior: 'smooth' })`.
- **Hover/focus:** colour and opacity changes over 120 ms. Nothing scales and nothing bounces.
- **No entrance animations,** no skeleton shimmer and no spinners.
- `@media (prefers-reduced-motion: reduce)`: every transition is `none`, scrolling is `auto`, and
  planes jump once a second.

---

## 5. Layout

### 5.1 Desktop (1440x900)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ skyviu   FROM [STANFORD MAIN QUAD ▾]                     ● LIVE · 7 OF 12 PLANES WITHIN 29 MILES │  header 56px, --raised, hairline below
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 7 PLANES YOU CAN SEE FROM STANFORD          (h1#title, --fs-label, --visible)            │
│ Look south-southeast, 30° up                (--fs-answer 40px, 700)                      │
│ Southwest 2207 · Boeing 737-700 · 6,500 ft, descending · EASY      (--fs-lead, --muted)  │  ~150px
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ OVERHEAD                                                                                 │
│ 60° ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                          │
│ 30° ──────────────────────────────────────────────────────────────────── (◯✈ SWA2207)  │  panorama
│            ✈ EJA612              ✈ UAL1234     ✈ CPA873                       ✈ ASA332    │  height 360px
│ 10° TREE LINE ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ⋯SKW 1 MIN │  full width
│ ░░░░░░░░░░ · ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ · ░░░░░░░░░░░░░░░░░░░░░░░ · ░░░░░░░░░░ │  minus gutters
│   The Dish                   SFO  San Francisco       Mt Diablo              San Jose     │
│ ──┴────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┴──────────── │
│   S       SW        W        NW       N        NE       E        SE       S               │
├────────────────────────────────────────────┬─────────────────────────────────────────────┤
│ IN YOUR SKY                                │ THIS PLANE                                  │
│ NOW    Southwest 2207       30° SSE  EASY  │ Aircraft   Boeing 737-700, N7712G           │
│ NOW    United 1234          17° NNW  FAIR  │ Altitude   6,500 ft, descending 900 ft/min  │
│ NOW    Cathay Pacific 873   17° N    HARD  │ Speed      276 mph                          │
│ …                                          │ Distance   2.2 mi (2.4 mi line of sight)    │
│ 1 MIN  SkyWest 5520         17° SE         │ Heard      1 s ago                          │
│ 3 MIN  American 2391        11° SE         │ [Share this plane]                          │
│ If each plane flies straight. Planes       │                                             │
│ turning to land often won't.               │ HOW IT DECIDES                              │
│                                            │ (existing copy, plain text, not <details>)  │
├────────────────────────────────────────────┴─────────────────────────────────────────────┤
│ Made by Nat Wong. Aircraft data from adsb.lol, ODbL 1.0. Moon and planets from …         │  footer, --fs-label
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

The header, answer and panorama fit within 900 px (56 + 150 + 360 + 40 ribbon ≈ 606 px), so the
first rows of the list show above the fold. Max content width is 1600 px, centred. The two lower
columns are `grid-template-columns: 3fr 2fr` with a `--s7` gap.

### 5.2 Mobile (390x844)

```
┌──────────────────────────────────┐
│ skyviu  [STANFORD ▾]   ● LIVE    │  header 48px; status text moves under the answer
├──────────────────────────────────┤
│ 7 PLANES YOU CAN SEE             │  h1, --fs-label
│ Look south-southeast,            │  --fs-answer 28px, max 2 lines
│ 30° up                           │
│ Southwest 2207 · 737-700 · EASY  │  --fs-lead → 16px under 640px
│ Live · 7 of 12 within 29 miles   │  #status, --fs-label
├──────────────────────────────────┤
│ 30° ──────────(◯✈ SWA2207)───── │  panorama viewport 390 wide, height 280,
│        ✈ ASA332   ⋯ SKW 1 MIN    │  scrolls sideways (overflow-x: auto),
│ 10° ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │  content 864px = 2.4 px per degree,
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  opens centred on the selected plane
│        San Jose                  │
│ ─┴────┴────┴────┴────┴────┴──── │
│  E         SE         S       ◀▶ │  compass letters scroll with the strip
├──────────────────────────────────┤
│ IN YOUR SKY                      │
│ NOW   Southwest 2207   30° SSE   │  grade drops to a second line
│       EASY                       │
│ NOW   United 1234      17° NNW   │
│ 1 MIN SkyWest 5520     17° SE    │
├──────────────────────────────────┤
│ THIS PLANE                       │  detail rows stack (dt above dd)
│ …                                │
│ HOW IT DECIDES …                 │
│ footer                           │
└──────────────────────────────────┘
```

The answer plus the panorama fill the first 844 px. The answer is never pushed below the fold.

### 5.3 Panorama geometry (exact)

- SVG `#sky`, `viewBox="0 0 W H"`. W is the container width on desktop and `864 + 2*48` on
  mobile, which adds a 20° wrap-around margin each side. H is 360 on desktop and 280 under 640 px.
- Plot area: top `24`, bottom `H - 40`. The bottom 40 px holds the compass ribbon.
- **x from bearing:** on desktop `x(b) = ((b + 180) % 360) / 360 * W`, so N is centred and S is
  at both edges. On mobile `x(b) = 48 + ((b + 180) % 360) * 2.4`. Anything within 20° of S is
  also drawn a second time at `x ± 864`, when that copy lands inside `0..W`, so a plane near S
  never gets cut in half. Implement this as a pure function `panoX(b, W, mobile)`.
- **y from elevation**, piecewise linear between these stops (elevation → share of plot height
  from the bottom): `0° → 0`, `10° → 0.15`, `30° → 0.55`, `60° → 0.85`, `90° → 1`. So 10–30°,
  where most visible planes are, gets 40% of the height. Implement as a pure function
  `panoY(el, top, bottom)` next to the geometry helpers.
- Gridlines: 10° (dashed `2 4`, labelled `10° · TREE LINE`), 30°, 60°, all `--line`. Put the
  text `OVERHEAD` at the top-left. The horizon is a solid 1 px `--muted` line at the plot bottom.
  The 0–10° band is filled `--below`.
- Ribbon: a tick every 15°, 5 px long, and 10 px long every 45°. Compass letters
  (N NE E SE S SW W NW) sit under the 45° ticks at `--fs-label`. `N` is `--text`; the rest are
  `--muted`.
- **Landmarks**, drawn just above the horizon in 11 px `--muted` text. Compute each bearing at
  runtime from `state.obs` with `geo()`. Skip a label that would overlap one already drawn,
  in list order:
  `SFO 37.6198,-122.3748`, `San Jose 37.3337,-121.8907`, `The Dish 37.4086,-122.1786`,
  `Mt Diablo 37.8816,-121.9142`, `San Francisco 37.7936,-122.3950`.
  From Stanford these come out at about 320°, 113°, 199°, 24° and 334°.
- **Sun:** an 8 px radius circle filled `--sun`, plus a dashed circle of radius
  `SUN_CLEAR`° (converted with the local x scale) in `--sun` at 40% opacity. That's the glare
  zone; planes inside it aren't counted. Draw it only when `sun.el > 0`.
- **Moon:** keep `moonGlyph()`, with radius 9, colours from tokens (`--muted` dark side, `--text`
  lit side). **Planets** that `bodyWhy()` says are visible: a 3 px `--text` dot plus the name in
  11 px `--muted`, because Venus and Jupiter are the lights most often mistaken for planes.
- **Planes:**
  - Visible (`see.ok`): a filled `--visible` silhouette.
  - Soon (in `state.next`): a `--soon` outline, `stroke-dasharray: 2 2`, no fill, drawn at its
    *entry point*. A thin dotted `--soon` line runs from its current position to the entry
    point. The tag `N MIN` sits beside it at `--fs-label`.
  - Everything else airborne: a 2.5 px `--faint` dot, with no label and no click target.
  - Ground aircraft are not drawn.
- **Silhouette size:** `clamp(14, 10 + see.arcmin * 0.8, 28)` px. Paths are in a 24x24 box,
  nose up. Rotate them toward the plane's apparent motion: the screen angle from its
  panorama position now to its position 30 s ahead, the same method as the current chart.
  Pick the path by `raw.category`:
  - `A1`, `B1`, `B4` (light): `M12 2L13 7L22 8V10L13 10.5L12.6 18L15.5 19.5V21L12 20.5L8.5 21V19.5L11.4 18L11 10.5L2 10V8L11 7Z`
  - `A2`, `A3` (regional or narrowbody), and the default:
    `M12 1L13.2 8L22 13V15L13.2 12.5L12.8 19L16 21.5V23L12 22L8 23V21.5L11.2 19L10.8 12.5L2 15V13L10.8 8Z`
  - `A4`, `A5`, `A6` (heavy): `M12 .5L13.6 7L23.5 13.5V15.5L13.6 12.5L13 19.5L17 22V23.5L12 22.5L7 23.5V22L11 19.5L10.4 12.5L.5 15.5V13.5L10.4 7Z`
  - `A7` (rotorcraft): `M12 6a4 4 0 1 1 0 8a4 4 0 1 1 0-8ZM11.4 13.5H12.6V22H11.4ZM2 9.4H22V10.6H2Z`
- **Labels:** a callsign at 13 px `--text`, 6 px right of the glyph, for every visible and soon
  plane. The label moves left of the glyph if it would cross the right edge. If two labels
  overlap, the lower-ranked one (by `byEase`) is dropped. Measure label boxes only when the plane
  set changes (each 10 s `render()`), never on the 1 s tick.
- **Selected plane:** a ring of radius `size` in `--visible` (or `--soon` for a soon plane),
  1.5 px. Its label is 700 weight.

### 5.4 Components

| Component | Element / id | Notes |
|---|---|---|
| Header bar | `<header class="bar">` | wordmark `skyviu` (16 px, 700), place `<select id="place">`, `#status` (desktop only in the bar; on mobile `#status` moves under the answer through CSS order) |
| Title / count | `h1#title` | `--fs-label`, `--visible`. Text unchanged: "7 planes you can see from Stanford" |
| Answer | `#head` | `.answer` sentence (`--fs-answer`) and `.sub` line (`--fs-lead`). No glyphs. The panorama is the picture. |
| Panorama | `svg#sky` inside `div.pano` (scroll container on mobile) | §5.3 |
| Timeline | `section.timeline` holding `ol#now` and `ol#next` | styled as one list under one `IN YOUR SKY` label. Rows are `<button data-hex data-focus>` in a 4-column grid: when (`NOW` / `N MIN`, `--fs-data`, coloured), name (`--fs-body`), where (`17° NNW`, `--fs-data`), grade (`EASY`/`FAIR`/`HARD`/`LIGHTS`, `--fs-label`) |
| Plane detail | `section#card` (not `<details>`) | `THIS PLANE` label; `<dl>` with rows Aircraft, Altitude, Speed, Distance, Heard, Sound (when within 8 mi), Emergency (only when set); the Share button |
| How it decides | `section.how` | the existing copy as plain text under the detail column. Not collapsed. |
| Footer | `<footer>` | one line at `--fs-label`, with the credit moved here from the top byline |

Direction words use 16 points (`north-northwest`) in the answer sentence and short forms
(`NNW`) in rows. Add `compass16(b)` and `compass16Short(b)` beside the existing helpers.
Spotting grade: `grade(see)` returns `LIGHTS` if `see.lights`, `EASY` if `arcmin ≥ 15`, `FAIR` if
`arcmin ≥ 8`, and `HARD` otherwise. The cutoffs are relative to `MIN_ARCMIN = 5`. They are
estimates, the same as the rest of the visibility model.

### 5.5 States

| State | Answer line | Panorama | Timeline | Status |
|---|---|---|---|---|
| **Loading** (before the first data) | `Listening for planes…` | grid, ribbon, landmarks, sun and moon drawn straight away (they need no network) | `Waiting for the first update.` | `Connecting to adsb.lol` |
| **Visible planes** | `Look {dir16}, {el}° up` | normal | NOW rows, then soon rows | `Live · n of m planes within 29 miles` |
| **None visible, some soon** | `Nothing to see this second. Next: {name} in {t} min, {el}° up {dir16}.` | soon outlines only | soon rows | Live |
| **None visible, none soon** | `Quiet sky. {m} planes in range, none high or close enough to see.` (if m = 0: `No planes in range right now.`) | faint dots only | `Nothing on course to come into view in the next 10 minutes.` | Live |
| **Error, with older data** | unchanged, from the last good data | planes drawn at 50% opacity after 30 s without fresh data | unchanged | `--error` dot + `Data paused: {error}. Retrying every 10 s.` |
| **Error, no data ever** | `Can't reach the plane data right now.` | grid only | empty | as above |
| **Stale tab** (hidden, then shown) | unchanged until the next load | unchanged | unchanged | refresh straight away on `visibilitychange` (already does) |
| **No JS** | `<noscript>` paragraph: `skyviu needs JavaScript to fetch live plane positions.` | none | none | none |

`#status` keeps `role="status"` and only changes text when the text differs (`setText`). The
error string format must still match the existing smoke test regex
`/No answer from the data source \(adsb.lol returned 503\)/`. So the error copy is
`No answer from the data source ({error}). Retrying every 10 s.` (the "Data paused" wording above
is just the visual pattern).

### 5.6 Accessibility

- `svg#sky` gets `role="img"` and an `aria-label` rebuilt each `render()`:
  `"Horizon view. {n} planes you can see: {name} {el}° up {dir16}; … The list below has every plane."`
  The faint dots are not described.
- The timeline buttons are the accessible way to select a plane. Each has an accessible name like
  `Southwest 2207, visible now, 30 degrees up, south-southeast, easy to spot`. Keep the `data-focus`
  keys so focus survives the 10 s rebuild.
- Glyphs in the SVG get `tabindex="-1"` (they're pointer shortcuts only), so focus order isn't
  doubled.
- Visible and soon are told apart by shape (filled vs dashed outline) and by the text tag, not by
  colour alone.
- Focus ring: `outline: 2px solid var(--visible); outline-offset: 2px; border-radius: var(--r1)`.
- The mobile panorama scroll container is focusable (`tabindex="0"`, `aria-label="Horizon,
  scroll sideways"`) so keyboard users can scroll it with the arrow keys.
- Respect `prefers-reduced-motion` (§4.4). Text resizes to 200% without loss; the panorama
  scrolls, and the rows wrap.
- Contrast is per §4.2. Don't put text in `--faint`.

### 5.7 Performance budget

| Metric | Budget |
|---|---|
| `index.html` transferred (gzip) | ≤ 22 KB, and ≤ 60 KB raw (now 95 KB raw), after the cuts in §6 |
| Web fonts | 1 file (B612 Mono 400, latin), ≤ 30 KB |
| Third-party requests | Google Fonts only. No JS libraries, no analytics. |
| First paint of the shell (answer placeholder, panorama grid) | < 1.0 s on Fast 3G emulation, before any API answer |
| 1 s tick | ≤ 2 ms scripting on a mid-range phone: transform updates only, no `getBBox()`, no DOM rebuild |
| SVG nodes in `#sky` | ≤ 400 with 60 aircraft in range |
| Network | unchanged: one `/api/aircraft` call per 10 s while the tab is visible, none while hidden. `/api/orbits` goes away. |

---

## 6. Cuts

Delete these, with the reason for each:

1. **Camera / AR view.** That's `#ar`, `#arsvg`, `#arbar`, `#cta`, `#cam`, `drawAR()`,
   `startCamera()`, `stopCamera()`, `onArOrientation()`, `deviceAxes()`, the alignment code
   (`alignOn`, `alignTarget`, `saveAlign`, the `skyviu-align` localStorage key), `setView()`,
   `keepAwake()` and the wake lock, plus `isPhone`. It's roughly 400 lines. It needs two
   permissions and a compass that drifts, and it fails at night. The horizon view answers the same
   question without sensors.
2. **QR code** (`#qr`). It's a desktop gimmick that took the top-right of the first screen. A
   shared URL does the same job.
3. **"Show all in range" toggle** (`#showall`, `state.showAll`). Planes you can't see are now
   always drawn as faint dots, so there's nothing to toggle.
4. **"Also in the sky" list** (`#also`, `renderAlso()`, `nextPasses()`). The Moon and visible
   planets go on the panorama as markers, with no list.
5. **ISS and Tiangong.** That's `api/orbits.mjs`, `loadOrbits()`, `sgp4Init()`, `sgp4()`,
   `stationAt()`, `STATIONS`, `state.stations`, `state.passes`, plus the orbit tests in
   `test/api.mjs` and the `/api/orbits` route in `test/smoke.mjs`. They're about 200 lines and a
   second upstream, for an object that is visible a few minutes a day. **This is the one data
   pipeline change**, and it's justified: skyviu is about planes, and the CelesTrak proxy exists
   only for this feature. The adsb.lol proxy is not touched: same rounding, cache and URL.
6. **The `lookGlyph()` compass and tilt icon.** The answer sentence and the panorama replace it.
7. **The polar sky chart** in `renderChart()`. The panorama replaces it.
8. **`<details>` accordions** ("Flight details", "How it decides"). The content stays as plain
   sections. Hiding the selected plane's facts behind a click made the page feel empty.
9. **Detail rows nobody acts on:** "Route: Not broadcast" (already covered in "How it decides"),
   the readsb `SOURCES` sentence in "Heard" (keep the age only), and "Size in the sky"
   arcminutes (the grade covers it). Squawk shows only with an emergency.
10. **Fraunces and Inter**, the top byline ("A live project by …", moved to the footer), and the
    trailing-sentence copy style in rows.
11. **"My location"** in the place picker stays. It's cheap, it's private (rounded to 1 km), and it
    makes the page useful off campus. **The four listed places stay too**, because `?at=` links
    depend on them.

Not cut: the visibility model, plane projection, upcoming-pass search, sun/moon/planet maths
(`sunAt`, `moonAt`, `planetsAt`, `bodyWhy` minus the station branch), deep links, share, the
focus-preservation pattern and all the remaining tests.

---

## 7. Delivery plan

The work ships as six issues, in this order. Each leaves `npm test` green.

1. #49 Foundation: tokens, fonts, theme switch, page shell.
2. #50 Cuts: camera view, QR, show-all, Also list, stations and `api/orbits.mjs`.
3. #51 Core view: the horizon panorama replaces the polar chart.
4. #52 Answer, timeline and plane detail.
5. #53 States: loading, empty, error, stale, no-JS.
6. #54 Polish: motion, accessibility pass, performance budget.

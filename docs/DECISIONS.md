# Decisions

Why Beanscape is built the way it is. Each entry records the decision, the
alternative that was rejected, and what would make us revisit it.

---

## D1 — Vanilla HTML/CSS/JS, no build step

**Decision.** Plain static files. Three.js and GSAP are vendored into `vendor/`
as prebuilt assets; fonts are self-hosted in `assets/fonts/`.

**Rejected.** React + Vite or Next.js, which the project brief suggested.

**Why.** The site is a content encyclopedia with one interactive hero. There is
no application state to manage across routes, no data layer, and no server. A
build step would add a toolchain to maintain for no gain, and it would
complicate the zero-config GitHub Pages deploy this project uses.

**Cost accepted.** No JSX, no component model, no hot reload. If the drink
directory in *Discover Coffee* grows to the point where hand-written HTML per
drink becomes unmanageable, that is the trigger to introduce a static site
generator — most likely Astro, which keeps the static output.

**Revisit when.** Section C or E needs templated pages generated from data
files, or two sections need to share stateful UI.

---

## D2 — Three.js vendored and minified, not loaded from a CDN

**Decision.** `vendor/three.module.min.js` is an esbuild bundle of
`three.module.js`, committed to the repository. GSAP ships as its UMD build.

**Rejected.** A CDN `<script>` or import map.

**Why.** No third-party runtime dependency, no extra DNS/TLS round trip, works
offline, and the version can never shift underneath the site. 725 KB minified,
roughly 180 KB over the wire with gzip.

**Revisit when.** The payload becomes the bottleneck on slow connections — at
which point the fix is tree-shaking the Three.js imports actually used, not a CDN.

---

## D3 — Fonts self-hosted rather than Google Fonts

**Decision.** Fraunces (variable) and Archivo (variable) for Latin, Noto
Serif/Sans Bengali for Bangla, served from `assets/fonts/`.

**Why.** No third-party requests, no layout shift waiting on a font CDN, and the
Bangla faces are chosen deliberately rather than falling back to whatever the
device has. Total ~315 KB, preloaded for the two Latin faces.

---

## D4 — The scene graph is a pure function of one `state` object

**Decision.** `sequence.js` tweens only numbers on `state`. `scene.js` derives
every `visible` flag and material opacity from those numbers inside `tick()`.

**Rejected.** Toggling `object.visible` from GSAP `.call()` callbacks at fixed
timeline positions.

**Why.** Callbacks do not fire when a timeline is seeked, and `killTweensOf()`
on a timeline's own targets permanently guts it. The first implementation did
both, which meant Replay silently broke after one run and any seek left the
scene graph desynced from the playhead. Deriving state removes the whole class
of bug: Skip, Replay and seek are now just positions on one track.

---

## D5 — The cup is revealed during the pull-back, not at the wide shot

**Decision.** `cupReveal` runs from t=1.0 to t=1.8, while the camera is already
retreating and the burst embers still cover the centre. The wide shot settles at
t=2.2.

**Why.** The brief requires that the cup already exists when the vortex scene
begins and never appears suddenly. Revealing it at full size during the
close-up burst read as a pop-in; revealing it after the wide shot established
would break the requirement outright. Revealing it mid-retreat means it is small
by the time it is legible, and fully present before the wide shot exists.

---

## D6 — A convincing illusion, not a liquid simulation

**Decision.** The vortex is one `RingGeometry` with a simplex-fbm fragment
shader; the particles are a single `Points` buffer whose positions are computed
in the vertex shader from per-point attributes; the coffee surface is a
`CircleGeometry` with its own shader.

**Rejected.** Any real fluid solver.

**Why.** The brief explicitly permits a polished illusion and warns against
expensive physical accuracy. The whole effect is three draw calls.

---

## D7 — Procedural anti-aliasing on the vortex shader

**Decision.** The swirl's noise amplitude is damped by its screen-space
footprint (`fwidth`), and the plane fades at grazing angles and near the lens.

**Why.** Without it the fbm is badly undersampled where a pixel spans a large
slice of the noise domain, and it aliases into saturated rainbow banding at the
horizon and in the foreground. Clamping the geometry or the colours did not help
because the problem is sampling rate, not range.

**Known issue.** A faint seam can still be seen at the vortex rim when rendered
at very low resolution without MSAA. Needs confirming on real GPU hardware,
where the pixel footprint is several times smaller.

---

## D8 — Ambient sound is synthesised, and off by default

**Decision.** `ambience.js` builds a brown-noise bed and a low drone with the
Web Audio API. No audio file ships. It starts only on an explicit toggle.

**Why.** The brief calls ambient sound optional. Synthesising it avoids shipping
an asset and avoids autoplay, which browsers block and listeners resent. The
copy never claims the screen produces aroma — the sub-headline says so plainly.

---

## D9 — Unbuilt sections are labelled, not hidden

**Decision.** All five content sections appear in the homepage contents ledger
with the status "Being written".

**Why.** The brief is explicit: do not pretend unfinished features are complete.
Listing them communicates the shape of the project; the status tells the truth
about it.

---

## D10 — A contents ledger, not a grid of cards

**Decision.** The five sections are full-width rows separated by hairlines,
left-aligned, each with the section name set large in Fraunces.

**Rejected.** The default treatment — identical rounded cards in a 3-column
grid, each with the same shadow and border radius.

**Why.** This is an encyclopedia, so it gets a table of contents. The card grid
carries no information about the content and appears on every generated page
regardless of subject.

---

## D11 — Photoreal through post-processing, not photography

**Decision.** The cinematic look comes from a render pipeline, not stock
images: `EffectComposer` → `UnrealBloomPass` → a custom grade pass → `OutputPass`.
The grade does vignette, radial chromatic aberration, a cheap radial defocus
and animated film grain.

**Rejected.** Shipping photographs of coffee behind the headline.

**Why.** The brief asks for an original piece, and photographs would have to be
licensed, would not respond to the camera move, and would break the moment the
sequence needs the cup to rotate or the swirl to react. Bloom and a grade get
the same warmth while everything stays interactive and the repository stays
free of third-party image rights.

**Cost accepted.** Four extra full-screen passes. Mitigated by D13.

---

## D12 — Physically-based materials with procedural detail maps

**Decision.** `MeshPhysicalMaterial` throughout. Surface detail is generated at
runtime: a Perlin-fbm height field is Sobel-filtered into a tangent-space
normal map (`fbmCanvas` → `normalFromHeight`), giving the bean its pores and
the glaze its faint ripple. Shadow mapping is on, with the key light casting.

**Why.** Three things separated the first pass from a photograph: no surface
micro-detail, no contact shadow, and materials that were uniformly lit. The
normal maps fix the first, `castShadow`/`receiveShadow` the second, and
clearcoat plus a roughness map the third. A contact shadow in particular is
what stops an object reading as floating.

**Tuning notes, learned the hard way.** A dark roast is *dark*: the first
attempt lit it with two strong rim lights and a clearcoat, and it read as
amber glass. The fix was a matte body (roughness 0.85, no clearcoat, low
`envMapIntensity`) lit mostly by the key, with rim light used only to draw an
edge. Likewise black coffee is near-black — crema is a thin broken film and a
ring at the wall, not the colour of the whole surface.

---

## D13 — A low-power tier, chosen at boot

**Decision.** On four cores or fewer, or a viewport under 560px on its short
edge, the scene drops shadow mapping, the bloom pass and the defocus taps, uses
900 swirl particles instead of 2400, halves the shadow map and caps pixel ratio
at 1.25.

**Why.** The brief asks for fast loading and mobile fallbacks. Bloom is the
single most expensive pass and the defocus does seven texture fetches per
pixel; neither is worth a dropped frame rate on a phone. The grade, the
materials and the whole sequence still run — only the costly extras go.

**Revisit when.** Worth replacing the heuristic with a measured first-second
frame rate, which would catch a weak GPU behind a strong CPU.

---

## D14 — The brief beats the prototype on the drink customizer

**Decision.** No "Customize Your Cup" builder, despite panel 8 of the design
prototype showing one.

**Why.** The brief is explicit and gives a reason: *"Replace the Coffee Lab
entirely with a practical educational section. Do not build a drink customizer
or interactive coffee-making simulator."* A mockup panel is a visual sketch; a
written instruction with a stated rationale outranks it. The need it gestures
at — letting someone understand how a drink is put together — is served by
Recipes & Brewing, which teaches the real thing instead of simulating it.

**Revisit when.** The author says otherwise. This is a product call, not a
technical one.

---

## D15 — One data file carrying every language, not one file per language

**Decision.** `data/drinks.json` holds language-neutral structure (`id`,
`family`) with the prose inline as `{ "en": …, "bn": … }` on each field.

**Rejected.** `drinks.en.json` + `drinks.bn.json`.

**Why.** Split files drift. A drink added to one and forgotten in the other is
invisible until a reader switches language and finds a gap, and nothing in the
structure makes the omission obvious. Keeping both languages side by side in
one field makes a missing translation visible while editing, and
`npm run validate` fails the build on one.

**Cost accepted.** The file grows with each language. At six languages and a
few dozen drinks it is still well under the size where that matters; if it ever
is, the split should be per-language *chunks* loaded on demand, not per-language
copies of the whole structure.

---

## D16 — Search looks through every language at once

**Decision.** The directory search matches a query against all translations of
a drink's name, origin, tagline and profile, not only the active language.

**Why.** Someone reading the English interface may well know a drink by its
Bangla name, and the reverse. Searching only the active language quietly hides
results that are obviously there. Searching everything costs nothing at this
size and never returns something a reader would call wrong.

---

## D17 — The detail view carries its own language selector

**Decision.** The hash-routed detail view has a second language selector in its
own bar.

**Why.** The detail view is `position: fixed` and covers the page header, which
is where the only language selector lived — so a reader who opened a drink
could not change language without closing it first. A browser test caught this
by failing to click an element that was visually present but behind an overlay.
Two selectors is a smaller cost than making the detail view a partial overlay.

---

## D18 — CI runs the checks that were failing manually, and gates deploys

**Decision.** `.github/workflows/ci.yml` runs `npm run validate` (structural,
seconds) then the Playwright suite. `deploy.yml` publishes to Pages via
`workflow_run`, and only when CI concluded successfully.

**Why.** Every check in the suite corresponds to a bug that actually happened
during the build: a GLSL compile error that showed only as a blank canvas, a
replay button that silently stopped working after one use, a language selector
buried under an overlay, untranslated panels. Those were caught by hand, once.
The suite catches them every time.

**Design notes.**
- The deploy is a separate workflow gated on `workflow_run` rather than a job
  in CI, so a manual re-deploy never silently skips the tests.
- CI rebuilds `vendor/` and fails if the result differs from what is committed.
  Because the site ships without a build step, a stale vendored bundle would
  mean the live site runs a different Three.js than the lockfile claims, with
  nothing to reveal it.
- `concurrency: pages` with `cancel-in-progress: false` queues deploys instead
  of cancelling one midway, which can leave Pages in a half-published state.

---

## D19 — English is the default for everyone; the browser's language is ignored

**Decision.** Every visitor gets English on arrival. `preferredLanguage()`
consults only a previously stored choice, never `navigator.languages`.

**Rejected.** Auto-detecting the browser's language, which is what the first
implementation did.

**Why.** The site is authored in English and translated from it, so English is
the reference text rather than one option among six. Auto-detection meant a
reader whose browser was set to Bangla landed on a translation without ever
being shown the original — and, worse, could not tell that a translation was
what they were reading. It also made the first impression unpredictable: the
same URL showed different things to different people with nothing in the UI
explaining why.

A stored choice still wins, so toggling once carries across pages and return
visits. That is the only thing that changes the language.

**Known gap.** Sharing a link does not share a language: a Bangla reader
sending `discover.html#turkish` to a friend sends them the English page. A
`?lang=bn` parameter would fix it, and is the obvious next step if link-sharing
between readers in different languages turns out to matter.

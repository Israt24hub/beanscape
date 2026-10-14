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

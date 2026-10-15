# Beanscape

**A world in every cup.**

An independent, non-commercial encyclopedia of coffee: its history, its drinks,
how it is grown, roasted and brewed, and what it means in kitchens around the
world. Not a café site, not a shop.

The homepage opens with a cinematic bean-to-cup sequence rendered in WebGL.

---

## Status

| Part | State |
|---|---|
| Homepage + bean-to-cup sequence | **Done** |
| Translation architecture | **Done** (English and Bangla written; German, Spanish, Italian, Hindi scaffolded) |
| **Discover Coffee** | **Done** — 16 drinks, search, filters, detail views, both languages |
| CI + deploy pipeline | **Done** |
| Coffee History | Not started |
| Recipes & Brewing | Not started |
| From Bean to Cup | Not started |
| Coffee Around the World | Not started |

Unbuilt sections are listed on the homepage and in the nav, marked "Being written"
and not linked. Nothing is presented as finished that is not.

---

## Running it

There is no build step. Any static server works:

```bash
npm start          # http://localhost:8777
```

Opening `index.html` straight from disk also works, except that switching
language needs `fetch`, which browsers block on `file://`. English renders
either way because it lives in the markup.

## Testing

```bash
npm run validate   # structural checks, no browser, a few seconds
npm test           # Playwright: 22 checks across both pages
```

`validate` catches malformed JSON, a translation key present in one language
but not the other, a broken asset path, or a vendored bundle that has drifted
from the lockfile. `npm test` drives a real browser: console errors, mobile
overflow, language switching, reduced motion, the no-WebGL fallback, skip and
replay, search in both languages, deep links and dead internal links.

Every check in the suite caught a real bug at least once while the site was
being built — that is the bar for keeping one.

If the browser binary is not where Playwright expects it, point at it:

```bash
CHROMIUM_PATH=/path/to/chrome npm test
```

## Deploying

Pushing to `main` runs CI (`.github/workflows/ci.yml`); if it passes, the
deploy workflow publishes the repository root to GitHub Pages. A red build
never reaches the live site. Nothing is compiled.

Enable it once under **Settings → Pages → Source: GitHub Actions**.

---

## Layout

```
index.html            the homepage
discover.html         the drink directory
css/
  tokens.css          palette, type scale, spacing, @font-face
  base.css            reset, base typography, buttons
  home.css            masthead, cinematic stage, contents ledger, footer
  page.css            shared chrome for content pages
  discover.css        the directory grid and detail view
data/
  drinks.json         the drink directory's content, both languages in one file
js/
  main.js             wiring: boots i18n, then the sequence
  discover.js         the directory: search, filters, hash-routed detail views
  scene.js            the WebGL scene — geometry, shaders, particles, render loop
  sequence.js         the GSAP timeline that drives the six scenes
  i18n.js             translation layer and language selector
  ambience.js         optional Web Audio ambience (off by default)
i18n/
  en.json  bn.json    translations; one file per language
assets/
  fonts/              self-hosted woff2 — no external font requests
  icons/              the mark, as SVG and PNG
vendor/
  three.module.min.js bundled Three.js (see "Regenerating vendor")
  gsap.min.js         GSAP
tests/
  site.spec.js        the Playwright suite
scripts/
  validate.mjs        fast structural checks
  vendor-entry.js     the bundle entry for `npm run vendor`
docs/
  DECISIONS.md        why things are the way they are
```

## The bean-to-cup sequence

Six scenes on one continuous camera path, with no cuts:

1. **bean** — a roasted bean turns and shivers in the dark, waiting for a tap
2. **burst** — it cracks open; shards, embers and vapour spread outward
3. **vortex** — the camera is already far back: a small cup, *already holding
   coffee*, sits at the centre of a vast swirling vortex
4. **approach** — the camera closes in; the cup grows; the vortex spirals inward
5. **merge** — the swirl folds into the coffee that was always in the cup
6. **aroma** — the camera settles, steam rises, the headline arrives

The cup is built once and revealed while the embers still cover it, during the
pull-back. It is never created, swapped or faded in during the approach — it
only ever gets closer.

`scene.js` derives every visibility flag from numbers on a single `state`
object, and `sequence.js` only ever tweens those numbers. That is what makes
Skip, Replay and timeline-seeking safe: the scene graph cannot desync from the
playhead.

**Controls:** tap the bean to begin · Skip · Replay · ambient sound toggle.
`prefers-reduced-motion` presents the finished cup without playing the film;
Replay still works if asked for explicitly. Without WebGL the headline and a
plain explanation are shown instead.

## Adding a language

1. Copy `i18n/en.json` to `i18n/<code>.json` and translate the values.
2. Add the same language key to every translatable field in `data/drinks.json`.
3. In `js/i18n.js`, set `ready: true` for that code in `LANGS`.
4. If the script needs a different font, add an `@font-face` in `css/tokens.css`
   and append the family to `--display` / `--text`.

`npm run validate` will tell you about any key you missed in step 1.

## Adding a drink

Append an entry to `data/drinks.json` with both languages filled in, and it
appears in the directory, the search index and the filters with no code change.
`npm run validate` checks the shape.

Markup is tagged `data-i18n="path.to.key"` for text and
`data-i18n-attr="aria-label:path.to.key"` for attributes. English is read out
of the DOM at boot, so it needs no fetch.

## Regenerating vendor

Only needed when upgrading Three.js or GSAP:

```bash
npm install
npm run vendor
```

`node_modules/` is not committed; `vendor/` is, so the site has no build step.

---

Built with Claude Code.

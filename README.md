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
| Coffee History | Not started |
| Discover Coffee | Not started |
| Recipes & Brewing | Not started |
| From Bean to Cup | Not started |
| Coffee Around the World | Not started |

The five content sections are listed on the homepage and marked "Being written".
Nothing is presented as finished that is not.

---

## Running it

There is no build step. Any static server works:

```bash
python3 -m http.server 8777
# then open http://localhost:8777
```

Opening `index.html` straight from disk also works, except that switching
language needs `fetch`, which browsers block on `file://`. English renders
either way because it lives in the markup.

## Deploying

Push to `main` and enable GitHub Pages on the repository root. There is nothing
to compile.

---

## Layout

```
index.html            the homepage
css/
  tokens.css          palette, type scale, spacing, @font-face
  base.css            reset, base typography, buttons
  home.css            masthead, cinematic stage, contents ledger, footer
js/
  main.js             wiring: boots i18n, then the sequence
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
2. In `js/i18n.js`, set `ready: true` for that code in `LANGS`.
3. If the script needs a different font, add an `@font-face` in `css/tokens.css`
   and append the family to `--display` / `--text`.

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

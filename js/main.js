/* Beanscape — homepage wiring.
 * Boots the translation layer, then the bean-to-cup sequence if WebGL allows.
 */

import { createI18n, mountLanguageSelector } from './i18n.js';
import { createScene } from './scene.js';
import { buildSequence } from './sequence.js';
import { createAmbience } from './ambience.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  canvas: $('#scene'),
  fallback: $('#stage-fallback'),
  loader: $('#stage-loader'),
  noWebgl: $('#stage-nowebgl'),
  invite: $('#invite'),
  beanTrigger: $('#bean-trigger'),
  payoff: $('#payoff'),
  skip: $('#skip-btn'),
  replay: $('#replay-btn'),
  scrollCue: $('#scroll-cue'),
  sound: $('#sound-toggle'),
  lang: $('#lang'),
  stage: $('#stage')
};

/* The scene emits phases before the interface wiring exists, so route them
   through a handler that is swapped in once everything is built. */
let phaseHandler = () => {};
const applyPhase = (phase) => phaseHandler(phase);

/* ---------------- translation ---------------- */
const i18n = createI18n(document);
mountLanguageSelector(el.lang, i18n);
i18n.init();

/* ---------------- ambience ---------------- */
const ambience = createAmbience();

function syncSoundLabel() {
  const on = ambience.enabled;
  const key = on ? 'nav.soundOff' : 'nav.soundOn';
  el.sound.dataset.i18nAttr = `aria-label:${key}`;
  const text = i18n.translate(key);
  if (text) el.sound.setAttribute('aria-label', text);
  el.sound.setAttribute('aria-pressed', String(on));
}

el.sound.addEventListener('click', async () => {
  await ambience.toggle();
  syncSoundLabel();
});

document.addEventListener('beanscape:language', syncSoundLabel);

/* ---------------- the sequence ---------------- */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showNoWebgl() {
  el.loader.hidden = true;
  el.noWebgl.hidden = false;
  el.fallback.hidden = false;
  el.fallback.classList.add('is-nowebgl');
  el.invite.hidden = true;
  el.skip.hidden = true;
  el.replay.hidden = true;
  el.scrollCue.classList.add('is-visible');
  el.scrollCue.style.opacity = '1';
  // the headline still belongs on the page; it just arrives without the film
  el.payoff.classList.add('is-visible');
  el.payoff.style.opacity = '1';
  el.payoff.style.transform = 'none';
}

const gsap = window.gsap;
const api = gsap ? createScene(el.canvas, { reducedMotion, onPhase: applyPhase }) : null;

if (!api) {
  showNoWebgl();
} else {
  const seq = buildSequence(api, el, gsap);

  phaseHandler = (phase) => {
    const idle = phase === 'idle';
    const done = phase === 'aroma';

    gsap.to(el.invite, { opacity: idle ? 1 : 0, duration: 0.4 });
    el.invite.style.pointerEvents = idle ? 'auto' : 'none';

    if (done) {
      el.payoff.classList.add('is-visible');
      gsap.to(el.payoff, { opacity: 1, y: 0, duration: 1.1, delay: 0.4, ease: 'power2.out' });
      el.scrollCue.classList.add('is-visible');
      el.skip.hidden = true;
      el.replay.hidden = false;
      ambience.warm(1);
    } else {
      gsap.set(el.payoff, { opacity: 0, y: '8vh' });
      el.payoff.classList.remove('is-visible');
      el.scrollCue.classList.remove('is-visible');
      el.skip.hidden = false;
      el.replay.hidden = true;
      ambience.warm(0);
    }
  };

  const begin = () => {
    if (api.state.phase === 'idle') seq.play();
  };

  el.beanTrigger.addEventListener('click', begin);
  el.canvas.addEventListener('pointerdown', begin);

  el.skip.addEventListener('click', () => {
    seq.skip();
    phaseHandler('aroma');
  });

  el.replay.addEventListener('click', () => seq.play());

  api.start();
  seq.resetToIdle();

  // reduced motion: present the finished cup, do not run the film unasked
  if (reducedMotion) {
    seq.settleImmediately();
    phaseHandler('aroma');
  } else {
    phaseHandler('idle');
  }

  requestAnimationFrame(() => { el.fallback.hidden = true; });

  new ResizeObserver(() => api.resize()).observe(el.stage);

  // handle for visual regression captures and for debugging in the console
  window.__beanscape = { api, seq, i18n };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) api.stop();
    else api.start();
  });
}

syncSoundLabel();

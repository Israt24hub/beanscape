/* Beanscape — Discover Coffee.
 *
 * The directory renders from data/drinks.json. Search and filtering are pure
 * functions of two pieces of state (query, family) so the view can always be
 * rebuilt from scratch rather than patched.
 *
 * Detail views are hash-routed (#espresso) so every drink has a shareable URL
 * and the browser's back button behaves the way a reader expects.
 */

import { createI18n, mountLanguageSelector } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  search: $('#search'),
  clear: $('#search-clear'),
  filters: $('#filters'),
  grid: $('#drinks'),
  empty: $('#empty'),
  count: $('#resultcount'),
  detail: $('#detail'),
  back: $('#detail-back'),
  lang: $('#lang'),
  detailLang: $('#detail-lang')
};

const i18n = createI18n(document);
mountLanguageSelector(el.lang, i18n);
// the detail view covers the page header, so it needs its own selector or the
// reader is stuck in one language while reading
mountLanguageSelector(el.detailLang, i18n);

let DATA = null;
let lang = 'en';
const state = { query: '', family: 'all' };

/** Pick the active language from a {en, bn} field, falling back to English. */
const t = (field) => (field && (field[lang] ?? field.en)) || '';

/* ---------------- rendering ---------------- */

function matches(drink) {
  if (state.family !== 'all' && drink.family !== state.family) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  // search both languages at once: someone typing Bangla should find the drink
  // even while the interface is in English, and the reverse
  const hay = [
    drink.name, drink.origin, drink.tagline, drink.profile
  ].flatMap((f) => [f.en, f.bn]).join(' ').toLowerCase();
  return hay.includes(q);
}

function renderFilters() {
  const families = [
    { id: 'all', label: { en: 'All', bn: 'সব' } },
    ...DATA.families.map((f) => ({ id: f.id, label: { en: f.en, bn: f.bn } }))
  ];
  el.filters.innerHTML = families.map((f) => `
    <li><button type="button" data-family="${f.id}"
        aria-pressed="${f.id === state.family}">${t(f.label)}</button></li>`).join('');
}

function renderGrid() {
  const found = DATA.drinks.filter(matches);

  el.grid.innerHTML = found.map((d) => `
    <li class="drink">
      <a class="drink__link" href="#${d.id}">
        <span class="drink__origin">${t(d.origin)}</span>
        <h2 class="drink__name">${t(d.name)}</h2>
        <p class="drink__tagline">${t(d.tagline)}</p>
        <p class="drink__profile">${t(d.profile)}</p>
      </a>
    </li>`).join('');

  el.empty.hidden = found.length > 0;

  const label = found.length === 1
    ? i18n.translate('discover.countOne')
    : i18n.translate('discover.countMany');
  el.count.textContent = (label || '{n} drinks').replace('{n}', found.length);
}

function renderDetail(id) {
  const index = DATA.drinks.findIndex((d) => d.id === id);
  if (index < 0) return false;
  const d = DATA.drinks[index];

  $('#detail-origin').textContent = t(d.origin);
  $('#detail-name').textContent = t(d.name);
  $('#detail-tagline').textContent = t(d.tagline);

  const facts = [
    [i18n.translate('discover.factOrigin') || 'Origin', t(d.origin)],
    [i18n.translate('discover.factServed') || 'Typically served', t(d.volume)],
    [i18n.translate('discover.factProfile') || 'Flavour profile', t(d.profile)],
    [i18n.translate('discover.factKind') || 'Kind',
      t(DATA.families.find((f) => f.id === d.family) || { en: d.family })]
  ];
  $('#detail-facts').innerHTML = facts.map(([k, v]) =>
    `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  // body copy is authored as plain paragraphs separated by blank lines
  $('#detail-prose').innerHTML = t(d.body)
    .split('\n\n')
    .map((p) => `<p>${p.trim()}</p>`)
    .join('');

  const notes = d.notes[lang] ?? d.notes.en ?? [];
  $('#detail-notes-list').innerHTML = notes.map((n) => `<li>${n}</li>`).join('');
  $('#detail-notes').hidden = notes.length === 0;

  const prev = DATA.drinks[index - 1];
  const next = DATA.drinks[index + 1];
  const prevEl = $('#detail-prev');
  const nextEl = $('#detail-next');
  prevEl.hidden = !prev;
  nextEl.hidden = !next;
  if (prev) {
    prevEl.href = `#${prev.id}`;
    $('#detail-prev-name').textContent = t(prev.name);
  }
  if (next) {
    nextEl.href = `#${next.id}`;
    $('#detail-next-name').textContent = t(next.name);
  }

  document.title = `${t(d.name)} — Beanscape`;
  return true;
}

/* ---------------- routing ---------------- */

function openDetail(id) {
  if (!renderDetail(id)) {
    closeDetail(true);
    return;
  }
  el.detail.hidden = false;
  document.body.style.overflow = 'hidden';
  el.detail.scrollTop = 0;
  el.detail.focus();
}

function closeDetail(replaceHash = false) {
  el.detail.hidden = true;
  document.body.style.overflow = '';
  document.title = i18n.translate('discover.pageTitle') || 'Discover Coffee — Beanscape';
  if (replaceHash && location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function route() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (id) openDetail(id);
  else closeDetail();
}

/* ---------------- wiring ---------------- */

el.search.addEventListener('input', () => {
  state.query = el.search.value;
  el.clear.hidden = state.query.length === 0;
  renderGrid();
});

el.clear.addEventListener('click', () => {
  el.search.value = '';
  state.query = '';
  el.clear.hidden = true;
  renderGrid();
  el.search.focus();
});

el.filters.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-family]');
  if (!btn) return;
  state.family = btn.dataset.family;
  renderFilters();
  renderGrid();
});

el.back.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else closeDetail(true);
});

window.addEventListener('hashchange', route);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el.detail.hidden) {
    el.back.click();
  }
});

// re-render everything when the language changes; the view is a pure function
// of state, so there is nothing to patch
document.addEventListener('beanscape:language', (event) => {
  lang = event.detail.code;
  if (!DATA) return;
  renderFilters();
  renderGrid();
  if (!el.detail.hidden) renderDetail(location.hash.replace(/^#/, ''));
});

/* ---------------- boot ---------------- */

(async function init() {
  await i18n.init();
  lang = i18n.current;

  try {
    const res = await fetch('data/drinks.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`drinks.json responded ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    el.empty.hidden = false;
    el.empty.textContent = i18n.translate('discover.loadError')
      || 'The drink directory could not be loaded.';
    console.error(err);
    return;
  }

  renderFilters();
  renderGrid();
  route();

  window.__discover = { state, data: DATA, renderGrid };
})();

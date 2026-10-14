/* Beanscape — translation layer.
 *
 * The page ships with English in the markup, so it renders correctly even from
 * file:// where fetch() is blocked. On boot we snapshot that markup as the
 * English dictionary; other languages are fetched from /i18n/<code>.json.
 *
 * Markup contract:
 *   data-i18n="stage.headline"              -> sets textContent
 *   data-i18n-attr="aria-label:nav.language" -> sets one or more attributes
 */

export const LANGS = [
  { code: 'en', native: 'English',  english: 'English', dir: 'ltr', ready: true },
  { code: 'bn', native: 'বাংলা',    english: 'Bangla',  dir: 'ltr', ready: true },
  { code: 'de', native: 'Deutsch',  english: 'German',  dir: 'ltr', ready: false },
  { code: 'es', native: 'Español',  english: 'Spanish', dir: 'ltr', ready: false },
  { code: 'it', native: 'Italiano', english: 'Italian', dir: 'ltr', ready: false },
  { code: 'hi', native: 'हिन्दी',     english: 'Hindi',   dir: 'ltr', ready: false }
];

const STORAGE_KEY = 'beanscape.lang';
const cache = new Map();

function readPath(dict, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), dict);
}

function writePath(dict, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let node = dict;
  for (const key of keys) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[last] = value;
}

/** Build the English dictionary from the markup that is already on the page. */
function snapshotEnglish(root) {
  const dict = {};
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    writePath(dict, el.dataset.i18n, el.textContent.trim());
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(',').forEach((pair) => {
      const [attr, path] = pair.split(':').map((s) => s.trim());
      if (attr && path) writePath(dict, path, el.getAttribute(attr) || '');
    });
  });
  writePath(dict, 'meta.title', document.title);
  const desc = document.querySelector('meta[name="description"]');
  if (desc) writePath(dict, 'meta.description', desc.getAttribute('content') || '');
  return dict;
}

async function loadDictionary(code) {
  if (cache.has(code)) return cache.get(code);
  const res = await fetch(`i18n/${code}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Missing translation file for "${code}"`);
  const dict = await res.json();
  cache.set(code, dict);
  return dict;
}

function applyDictionary(dict, root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = readPath(dict, el.dataset.i18n);
    if (typeof value === 'string') el.textContent = value;
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(',').forEach((pair) => {
      const [attr, path] = pair.split(':').map((s) => s.trim());
      const value = readPath(dict, path);
      if (attr && typeof value === 'string') el.setAttribute(attr, value);
    });
  });
  const title = readPath(dict, 'meta.title');
  if (title) document.title = title;
  const desc = readPath(dict, 'meta.description');
  const descEl = document.querySelector('meta[name="description"]');
  if (desc && descEl) descEl.setAttribute('content', desc);
}

function preferredLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && LANGS.some((l) => l.code === stored && l.ready)) return stored;
  for (const tag of navigator.languages || [navigator.language || 'en']) {
    const base = String(tag).toLowerCase().split('-')[0];
    const match = LANGS.find((l) => l.code === base && l.ready);
    if (match) return match.code;
  }
  return 'en';
}

export function createI18n(root = document) {
  cache.set('en', snapshotEnglish(root));
  let current = 'en';

  async function setLanguage(code) {
    const lang = LANGS.find((l) => l.code === code);
    if (!lang || !lang.ready) return current;
    const dict = await loadDictionary(code);
    applyDictionary(dict, root);
    document.documentElement.lang = code;
    document.documentElement.dir = lang.dir;
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private mode */ }
    document.dispatchEvent(new CustomEvent('beanscape:language', { detail: { code, dict } }));
    return code;
  }

  return {
    get current() { return current; },
    setLanguage,
    translate: (path) => readPath(cache.get(current) || {}, path),
    init: () => setLanguage(preferredLanguage())
  };
}

/* ---------- language selector ---------- */

export function mountLanguageSelector(el, i18n) {
  const toggle = el.querySelector('.lang__toggle');
  const label = el.querySelector('.lang__code');
  const menu = el.querySelector('.lang__menu');
  if (!toggle || !menu || !label) return;

  menu.innerHTML = LANGS.map((lang) => `
    <li role="none">
      <button type="button" role="menuitemradio" data-lang="${lang.code}"
              aria-current="false" ${lang.ready ? '' : 'disabled'}>
        <span class="lang__native" lang="${lang.code}">${lang.native}</span>
        <span class="lang__status">${lang.ready ? lang.english : 'soon'}</span>
      </button>
    </li>`).join('');

  const sync = () => {
    label.textContent = i18n.current.toUpperCase();
    menu.querySelectorAll('button[data-lang]').forEach((btn) => {
      btn.setAttribute('aria-current', String(btn.dataset.lang === i18n.current));
    });
  };

  const close = () => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    menu.querySelector('button:not([disabled])')?.focus();
  };

  toggle.addEventListener('click', () => (menu.hidden ? open() : close()));

  menu.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-lang]');
    if (!btn || btn.disabled) return;
    await i18n.setLanguage(btn.dataset.lang);
    sync();
    close();
    toggle.focus();
  });

  el.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      close();
      toggle.focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (!el.contains(event.target) && !menu.hidden) close();
  });

  document.addEventListener('beanscape:language', sync);
  sync();
}

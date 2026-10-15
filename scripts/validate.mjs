/* Fast structural checks that need no browser.
 *
 * This runs first in CI so an obvious mistake — malformed JSON, a missing
 * translation, a stylesheet that was never created — fails in seconds instead
 * of after a full browser run.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const ok = [];

const read = (p) => readFileSync(join(root, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p));

function check(label, fn) {
  try {
    const detail = fn();
    ok.push(detail ? `${label} — ${detail}` : label);
  } catch (err) {
    problems.push(`${label}: ${err.message}`);
  }
}

/* ---- JSON parses ---- */
check('JSON files parse', () => {
  const files = ['data/drinks.json', 'i18n/en.json', 'i18n/bn.json', 'package.json'];
  files.forEach(readJSON);
  return `${files.length} files`;
});

/* ---- translation key parity ---- */
check('translation keys match across languages', () => {
  const flat = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? flat(v, `${prefix}${k}.`)
        : [`${prefix}${k}`]);

  const en = flat(readJSON('i18n/en.json'));
  const bn = flat(readJSON('i18n/bn.json'));
  const missingBn = en.filter((k) => !bn.includes(k));
  const missingEn = bn.filter((k) => !en.includes(k));
  if (missingBn.length) throw new Error(`bn is missing: ${missingBn.join(', ')}`);
  if (missingEn.length) throw new Error(`en is missing: ${missingEn.join(', ')}`);
  return `${en.length} keys`;
});

/* ---- drink data ---- */
check('drink data is complete', () => {
  const data = readJSON('data/drinks.json');
  const families = new Set(data.families.map((f) => f.id));
  const ids = new Set();
  const fields = ['name', 'tagline', 'origin', 'volume', 'profile', 'body', 'notes'];

  for (const d of data.drinks) {
    if (ids.has(d.id)) throw new Error(`duplicate id "${d.id}"`);
    ids.add(d.id);
    if (!families.has(d.family)) throw new Error(`${d.id}: unknown family "${d.family}"`);
    for (const f of fields) {
      if (!d[f]?.en) throw new Error(`${d.id}.${f} missing en`);
      if (!d[f]?.bn) throw new Error(`${d.id}.${f} missing bn`);
    }
  }
  return `${data.drinks.length} drinks, ${families.size} families`;
});

/* ---- referenced local assets exist ---- */
check('every local href/src resolves', () => {
  const pages = readdirSync(root).filter((f) => f.endsWith('.html'));
  let checked = 0;

  for (const page of pages) {
    const html = read(page);
    const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|data:|\/\/|\.\/$)/.test(ref)) continue;
      // sections not built yet are present in the nav but marked aria-disabled
      const disabled = new RegExp(`href="${ref}"[^>]*aria-disabled="true"`).test(html);
      if (disabled) continue;
      if (!existsSync(join(root, ref))) {
        throw new Error(`${page} references missing ${ref}`);
      }
      checked++;
    }
  }
  return `${checked} references across ${pages.length} pages`;
});

/* ---- vendored libraries are present and non-trivial ---- */
check('vendored libraries are committed', () => {
  for (const [file, minBytes] of [['vendor/three.module.min.js', 200_000],
                                  ['vendor/gsap.min.js', 20_000]]) {
    if (!existsSync(join(root, file))) throw new Error(`${file} is missing — run npm run vendor`);
    const size = read(file).length;
    if (size < minBytes) throw new Error(`${file} looks truncated (${size} bytes)`);
  }
  return 'three + gsap';
});

/* ---- the page must not depend on an outside CDN ---- */
check('no third-party runtime dependencies', () => {
  const pages = readdirSync(root).filter((f) => f.endsWith('.html'));
  for (const page of pages) {
    const external = [...read(page).matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    if (external.length) {
      throw new Error(`${page} loads from ${external.join(', ')}`);
    }
  }
  return `${pages.length} pages are self-contained`;
});

/* ---- report ---- */
ok.forEach((line) => console.log(`  ok   ${line}`));
if (problems.length) {
  console.error('');
  problems.forEach((line) => console.error(`  FAIL ${line}`));
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log(`\nAll ${ok.length} checks passed.`);

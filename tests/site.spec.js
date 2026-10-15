/* Beanscape — the checks that used to be done by hand.
 *
 * Everything here caught a real bug at least once while the site was built,
 * which is the bar for keeping a test: the i18n key-parity check caught an
 * untranslated panel, the overlay check caught a language selector buried
 * under the detail view, and the console check caught a GLSL compile error
 * that only showed as a blank canvas.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PAGES = ['/', '/discover.html'];

/** Collect console errors and uncaught exceptions for the life of a page. */
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/* ============ data integrity ============ */

test.describe('drink data', () => {
  const data = JSON.parse(readFileSync(new URL('../data/drinks.json', import.meta.url)));

  test('ids are unique and families resolve', () => {
    const ids = data.drinks.map((d) => d.id);
    expect(new Set(ids).size, 'duplicate drink id').toBe(ids.length);

    const families = new Set(data.families.map((f) => f.id));
    for (const d of data.drinks) {
      expect(families.has(d.family), `${d.id} has unknown family "${d.family}"`).toBe(true);
    }
  });

  test('every translatable field carries both languages', () => {
    const fields = ['name', 'tagline', 'origin', 'volume', 'profile', 'body', 'notes'];
    for (const d of data.drinks) {
      for (const f of fields) {
        expect(d[f]?.en, `${d.id}.${f} missing en`).toBeTruthy();
        expect(d[f]?.bn, `${d.id}.${f} missing bn`).toBeTruthy();
      }
      // a detail page with one paragraph is a stub, not an entry
      expect(d.body.en.split('\n\n').length, `${d.id} body too thin`).toBeGreaterThanOrEqual(2);
      expect(d.body.bn.split('\n\n').length, `${d.id} bn body too thin`).toBeGreaterThanOrEqual(2);
    }
  });
});

test('translation files have identical key sets', () => {
  const flat = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? flat(v, `${prefix}${k}.`)
        : [`${prefix}${k}`]);

  const en = flat(JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url))));
  const bn = flat(JSON.parse(readFileSync(new URL('../i18n/bn.json', import.meta.url))));

  expect(en.filter((k) => !bn.includes(k)), 'keys missing from bn').toEqual([]);
  expect(bn.filter((k) => !en.includes(k)), 'keys missing from en').toEqual([]);
});

/* ============ every page ============ */

for (const path of PAGES) {
  test.describe(`page ${path}`, () => {
    test('loads without console errors', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      expect(errors).toEqual([]);
    });

    test('has no horizontal overflow on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const overflows = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflows).toBe(false);
    });

    test('switches to Bangla and back', async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);

      await page.locator('.lang__toggle').first().click();
      await page.locator('.lang__menu:not([hidden]) button[data-lang="bn"]').first().click();
      await page.waitForTimeout(700);

      await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
      // the visible page must actually contain Bangla script, not just the attribute
      const text = await page.locator('main').innerText();
      expect(/[ঀ-৿]/.test(text), 'no Bangla characters rendered').toBe(true);

      await page.locator('.lang__toggle').first().click();
      await page.locator('.lang__menu:not([hidden]) button[data-lang="en"]').first().click();
      await page.waitForTimeout(700);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });

    test('languages that are not written yet are disabled', async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      await page.locator('.lang__toggle').first().click();
      for (const code of ['de', 'es', 'it', 'hi']) {
        await expect(
          page.locator(`.lang__menu:not([hidden]) button[data-lang="${code}"]`).first()
        ).toBeDisabled();
      }
    });
  });
}

/* ============ homepage ============ */

test.describe('homepage', () => {
  test('presents the finished cup when motion is reduced', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__beanscape !== undefined, { timeout: 30000 });
    await page.waitForTimeout(600);

    const state = await page.evaluate(() => ({
      cupReveal: window.__beanscape.api.state.cupReveal,
      settle: window.__beanscape.api.state.settle
    }));
    expect(state.cupReveal).toBeGreaterThan(0.9);
    expect(state.settle).toBeGreaterThan(0.9);
    await ctx.close();
  });

  test('falls back gracefully without WebGL', async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await expect(page.locator('#stage-nowebgl')).toBeVisible();
    // the headline still has to arrive, just without the film
    await expect(page.locator('.payoff__line')).toBeVisible();
    await ctx.close();
  });

  test('the sequence can be skipped and replayed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__beanscape !== undefined, { timeout: 30000 });

    await page.locator('#skip-btn').click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__beanscape.api.state.cupReveal)).toBeGreaterThan(0.9);
    await expect(page.locator('#replay-btn')).toBeVisible();

    // replay used to break silently after one run: the reset killed the
    // timeline's own tweens, so the second play had nothing left to animate
    await page.locator('#replay-btn').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__beanscape.seq.timeline.totalDuration()))
      .toBeGreaterThan(5);
  });
});

/* ============ discover ============ */

test.describe('discover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/discover.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__discover !== undefined, { timeout: 20000 });
  });

  test('renders every drink', async ({ page }) => {
    const data = JSON.parse(readFileSync(new URL('../data/drinks.json', import.meta.url)));
    await expect(page.locator('.drink')).toHaveCount(data.drinks.length);
  });

  test('search matches either language', async ({ page }) => {
    await page.fill('#search', 'vietnam');
    await page.waitForTimeout(250);
    expect(await page.locator('.drink').count()).toBe(2);

    // a Bangla query must work while the interface is still English
    await page.fill('#search', 'তুর্কি');
    await page.waitForTimeout(250);
    expect(await page.locator('.drink').count()).toBe(1);

    await page.fill('#search', 'zzzznope');
    await page.waitForTimeout(250);
    await expect(page.locator('#empty')).toBeVisible();
  });

  test('family filter narrows the grid', async ({ page }) => {
    const all = await page.locator('.drink').count();
    await page.click('button[data-family="milk"]');
    await page.waitForTimeout(250);
    const milk = await page.locator('.drink').count();
    expect(milk).toBeGreaterThan(0);
    expect(milk).toBeLessThan(all);
  });

  test('a drink has a shareable URL and opens from it', async ({ page }) => {
    await page.goto('/discover.html#egg-coffee', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#detail-name')).not.toBeEmpty();
    expect(await page.locator('#detail-prose p').count()).toBeGreaterThanOrEqual(2);
  });

  test('an unknown drink id does not open an empty view', async ({ page }) => {
    await page.goto('/discover.html#not-a-drink', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await expect(page.locator('#detail')).toBeHidden();
  });

  test('language can be changed while reading a drink', async ({ page }) => {
    await page.goto('/discover.html#espresso', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const before = await page.locator('#detail-name').innerText();

    // the detail view covers the page header, so it carries its own selector
    await page.click('#detail-lang .lang__toggle');
    await page.click('#detail-lang-menu button[data-lang="bn"]');
    await page.waitForTimeout(700);

    const after = await page.locator('#detail-name').innerText();
    expect(after).not.toBe(before);
    expect(/[ঀ-৿]/.test(after)).toBe(true);
  });

  test('escape closes the detail view', async ({ page }) => {
    await page.goto('/discover.html#latte', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await expect(page.locator('#detail')).toBeHidden();
  });
});

/* ============ links ============ */

test('no internal link points at a missing page', async ({ page, request }) => {
  const seen = new Set();
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => ({
      href: a.getAttribute('href'),
      disabled: a.getAttribute('aria-disabled') === 'true'
    })));
    for (const { href, disabled } of hrefs) {
      // sections that are not written yet are marked, not linked
      if (disabled || !href || href.startsWith('#') || href.startsWith('http')) continue;
      seen.add(href);
    }
  }
  for (const href of seen) {
    const res = await request.get(href.startsWith('/') ? href : `/${href}`);
    expect(res.status(), `${href} is not reachable`).toBeLessThan(400);
  }
});

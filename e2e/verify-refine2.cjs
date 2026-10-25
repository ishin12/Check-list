const { chromium } = require('playwright');
const URL = 'http://localhost:5799';
const rec = (ok, n, ev) => console.log((ok ? 'PASS ' : 'FAIL ') + n + (ev ? ' :: ' + ev : ''));
async function open(browser, user, lng, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => rec(false, 'pageerror', e.message));
  await page.goto(URL + '/');
  await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0);
  await page.waitForTimeout(2000);
  await page.evaluate((i) => window.__demo.setActiveUser(i), user);
  await page.goto(URL + '/settings'); await page.waitForTimeout(700);
  await page.locator('button.btn--block').nth({ en: 0, ar: 1, ur: 2 }[lng]).click(); await page.waitForTimeout(500);
  return { ctx, page };
}
async function nav(page, p) {
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, p);
  await page.waitForTimeout(900);
}
(async () => {
  const browser = await chromium.launch();
  for (const lng of ['en', 'ar', 'ur']) for (const u of ['u-mgr', 'u-wa', 'u-wb']) {
    const { ctx, page } = await open(browser, u, lng);
    await nav(page, '/today');
    const d = await page.evaluate(() => ({ hero: (document.querySelector('.hero, .today-hero, main > :first-child') || {}).innerText, cards: document.querySelectorAll('main a[href^="/tasks/k-"]').length }));
    rec(true, `today ${lng} ${u}`, `visits listed=${d.cards} hero="${(d.hero || '').replace(/\n/g, ' / ').slice(0, 110)}"`);
    await ctx.close();
  }
  // Edit workers + Add location in ar / ur (manager)
  for (const lng of ['ar', 'ur']) {
    const { ctx, page } = await open(browser, 'u-mgr', lng);
    await nav(page, '/tasks/k-2');
    const row = await page.evaluate(() => [...document.querySelectorAll('.task-actions > *')].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 20), Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }));
    rec(row.length >= 2 && row[0][2] === row[1][2], `actions row side-by-side ${lng}`, JSON.stringify(row));
    // edit workers
    await page.locator('.task-actions .btn').first().click(); await page.waitForTimeout(500);
    const boxes = page.locator('.worker-edit input[type=checkbox]');
    const n = await boxes.count();
    const before = await page.evaluate(async () => 0);
    await boxes.nth(n - 1).click(); await page.waitForTimeout(200);
    await page.locator('.worker-edit .btn--primary').click(); await page.waitForTimeout(1000);
    const who = await page.locator('.task-head').innerText();
    rec(n >= 2 && !(await page.locator('.worker-edit').count()), `edit workers save ${lng}`, `checkboxes=${n} who=${who.replace(/\n/g, ' / ').slice(0, 100)}`);
    // add location
    await nav(page, '/tasks/k-8');
    const btns = page.locator('.task-actions .btn');
    await btns.nth(1).click(); await page.waitForTimeout(500);
    const inp = page.locator('.location-card input, .task-actions__panel input, input[type=text], input[type=url]').first();
    await inp.fill('24.5, 46.5'); await page.waitForTimeout(300);
    await page.locator('.location-card .btn--primary, .task-actions__panel .btn--primary').last().click(); await page.waitForTimeout(1000);
    const links = await page.locator('.location-card a').count();
    rec(links >= 1, `add location save ${lng}`, 'maps links=' + links);
    await ctx.close();
  }
  // capture + viewer in ar/ur as worker on k-4 (has seeded proofs) -> viewer
  for (const lng of ['ar', 'ur']) {
    const { ctx, page } = await open(browser, 'u-wa', lng);
    await nav(page, '/tasks/k-4');
    const imgs = page.locator('.proof img, .proof-grid img, .proof__media img, main img');
    const c = await imgs.count();
    if (c) { await imgs.first().click(); await page.waitForTimeout(500); }
    const vis = await page.locator('.viewer').count();
    rec(c > 0 && vis > 0, `photo viewer opens ${lng}`, `imgs=${c} viewer=${vis}`);
    if (vis) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); rec((await page.locator('.viewer').count()) === 0, `viewer closes ${lng}`); }
    await nav(page, '/tasks/k-2/capture/finish');
    const cap = await page.evaluate(() => ({ h: document.body.innerText.slice(0, 80).replace(/\n/g, ' / '), btns: document.querySelectorAll('button, label').length, sw: document.documentElement.scrollWidth }));
    rec(cap.btns > 0 && cap.sw <= 390, `capture screen ${lng}`, JSON.stringify(cap));
    await ctx.close();
  }
  // desktop 1280
  for (const u of ['u-mgr', 'u-wa']) {
    const { ctx, page } = await open(browser, u, 'en', { viewport: { width: 1280, height: 800 } });
    await nav(page, '/today');
    const vis = await page.evaluate(() => { const s = document.querySelector('.side-nav'); const t = document.querySelector('.tab-bar'); return { side: !!s && getComputedStyle(s).display !== 'none', tab: !!t && getComputedStyle(t).display !== 'none' }; });
    const items = await page.locator('.side-nav a:visible').count();
    const seen = [];
    for (let i = 0; i < items; i++) {
      const a = page.locator('.side-nav a:visible').nth(i);
      const href = await a.getAttribute('href');
      if (href === '/tasks/new') continue;
      await a.click(); await page.waitForTimeout(500);
      seen.push([href, new globalThis.URL(page.url()).pathname]);
    }
    rec(vis.side && !vis.tab && seen.every((s) => s[0] === s[1]), `desktop sidenav ${u}`, JSON.stringify(vis) + ' ' + JSON.stringify(seen.map((s) => s[1])));
    await nav(page, '/tasks/k-1');
    const bar = await page.evaluate(() => { const b = document.querySelector('.action-bar'); if (!b) return null; const r = b.getBoundingClientRect(); const btn = b.querySelector('button').getBoundingClientRect(); const el = document.elementFromPoint(btn.x + btn.width / 2, btn.y + btn.height / 2); return { bottom: r.bottom, vh: innerHeight, hit: b.contains(el) }; });
    rec(!bar || (bar.bottom <= bar.vh && bar.hit), `desktop action bar ${u}`, JSON.stringify(bar));
    await ctx.close();
  }
  await browser.close();
})();

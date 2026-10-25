// Independent verification of the visual refinement (demo mode, port 5599).
const { chromium } = require('playwright');
const URL = 'http://localhost:5599';
const R = [];
const rec = (ok, name, ev) => { R.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ev ? ' :: ' + ev : '')); };
async function ctxFor(browser, user, lng) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => rec(false, 'pageerror', e.message));
  await page.goto(URL + '/');
  await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(2000); await page.evaluate((i) => window.__demo.setActiveUser(i), user);
  await page.goto(URL + '/settings'); await page.waitForTimeout(700);
  await page.locator('button.btn--block').nth({ en: 0, ar: 1, ur: 2 }[lng]).click(); await page.waitForTimeout(500);
  return { ctx, page };
}
async function nav(page, p) {
  await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, p);
  await page.waitForTimeout(800);
}
async function barCheck(page, label) {
  const info = await page.evaluate(() => {
    const bar = document.querySelector('.action-bar'); const tab = document.querySelector('.tab-bar');
    if (!bar) return { none: true };
    const b = bar.getBoundingClientRect(); const t = tab ? tab.getBoundingClientRect() : null;
    const btns = [...bar.querySelectorAll('button')].map((x) => {
      const r = x.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const el = document.elementFromPoint(cx, cy);
      return { text: x.textContent.trim(), top: r.top, bottom: r.bottom, left: r.left, right: r.right, hit: x === el || x.contains(el), disabled: x.disabled };
    });
    return { bar: { top: b.top, bottom: b.bottom }, tabTop: t && t.top, vh: innerHeight, btns };
  });
  if (info.none) return info;
  const ok = info.btns.length > 0 && info.btns.every((x) => x.hit && x.bottom <= (info.tabTop ?? info.vh) + 0.5 && x.top >= 0 && x.left >= 0 && x.right <= 390.5) && info.bar.bottom <= info.tabTop + 2;
  rec(ok, label, JSON.stringify({ bar: info.bar, tabTop: info.tabTop, btns: info.btns.map((b) => [b.text, Math.round(b.top), Math.round(b.bottom), b.hit, b.disabled]) }));
  return info;
}
(async () => {
  const browser = await chromium.launch();
  const cases = [
    ['u-wa', 'k-1', 'not_started'], ['u-wa', 'k-2', 'in_progress'], ['u-wa', 'k-6', 'rejected'],
    ['u-mgr', 'k-4', 'submitted'], ['u-mgr', 'k-1', 'not_started'], ['u-mgr', 'k-5', 'approved'], ['u-wa', 'k-4', 'submitted'],
  ];
  for (const lng of ['en', 'ar', 'ur']) for (const [u, id, st] of cases) {
    const { ctx, page } = await ctxFor(browser, u, lng);
    await nav(page, '/tasks/' + id);
    const r = await barCheck(page, `bar ${lng} ${u} ${id}(${st})`);
    if (r.none) rec(true, `no action bar ${lng} ${u} ${id}(${st})`, 'none rendered');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(200);
    if (!r.none) await barCheck(page, `bar@scrolled-bottom ${lng} ${u} ${id}`);
    await ctx.close();
  }
  for (const lng of ['en', 'ar', 'ur']) {
    let { ctx, page } = await ctxFor(browser, 'u-wa', lng);
    await nav(page, '/tasks/k-1');
    const before = await page.locator('.task-head__pills').innerText();
    await page.locator('.action-bar button').first().click(); await page.waitForTimeout(1200);
    const after = (await page.locator('.task-head__pills').innerText().catch(() => 'URL:' + page.url()));
    rec(before !== after, `start click ${lng}`, before + ' -> ' + after);
    await ctx.close();
    ({ ctx, page } = await ctxFor(browser, 'u-mgr', lng));
    await nav(page, '/tasks/k-4');
    const labels = await page.locator('.action-bar button').allTextContents();
    const b2 = await page.locator('.task-head__pills').innerText();
    await page.locator('.action-bar button').first().click(); await page.waitForTimeout(1200);
    const a2 = (await page.locator('.task-head__pills').innerText().catch(() => 'URL:' + page.url()));
    rec(b2 !== a2, `manager decision click ${lng}`, JSON.stringify(labels) + ' ' + b2 + ' -> ' + a2);
    await ctx.close();
  }
  for (const lng of ['en', 'ar', 'ur']) for (const u of ['u-mgr', 'u-wa']) {
    const { ctx, page } = await ctxFor(browser, u, lng);
    await nav(page, '/today');
    const n = await page.locator('.tab-bar__item').count();
    const seen = [];
    for (let i = 0; i < n; i++) {
      await page.locator('.tab-bar__item').nth(i).click(); await page.waitForTimeout(500);
      const href = await page.locator('.tab-bar__item').nth(i).getAttribute('href');
      seen.push([href, new globalThis.URL(page.url()).pathname, await page.locator('.tab-bar__item--active').count()]);
    }
    rec(seen.every((s) => s[0] === s[1] && s[2] === 1), `tabbar ${lng} ${u} n=${n}`, JSON.stringify(seen.map((s) => s[1])));
    await page.locator('.tab-bar__item').nth(0).click(); await page.waitForTimeout(500);
    await page.locator('a[href^="/tasks/k-"]').first().click(); await page.waitForTimeout(700);
    const bb = await page.evaluate(() => {
      const el = [...document.querySelectorAll('header button, header a')].find((e) => e.querySelector('svg'));
      if (!el) return null; const r = el.getBoundingClientRect(); const svg = el.querySelector('svg');
      const ur = svg.getBoundingClientRect();
      return { x: Math.round(r.x), tf: getComputedStyle(svg).transform, cls: svg.getAttribute('class'), aria: el.getAttribute('aria-label') };
    });
    const rtl = lng !== 'en';
    const left = bb && bb.x < 195;
    rec(!!bb && (rtl ? !left : left), `back btn side ${lng} ${u}`, JSON.stringify(bb));
    await page.locator('header button, header a').filter({ has: page.locator('svg') }).first().click(); await page.waitForTimeout(600);
    rec(new globalThis.URL(page.url()).pathname === '/today', `back navigates ${lng} ${u}`, page.url());
    await ctx.close();
  }
  await browser.close();
  console.log('SUMMARY', R.filter(Boolean).length + '/' + R.length);
})();

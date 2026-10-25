// Desktop 1280 manager quick pass (demo mode, port 5799).
const { chromium } = require('playwright');
const path = require('path');
const URL = 'http://localhost:5799';
const OUT = path.join(__dirname, 'shots-handover') + '/';
const errs = [];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(URL + '/');
  await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__demo.setActiveUser('u-mgr'));
  await page.goto(URL + '/today'); await page.waitForTimeout(800);
  const nav = page.locator('nav a, .side-nav a');
  console.log('nav links', JSON.stringify(await page.locator('.side-nav a, aside a').allInnerTexts()));
  const bad = [];
  async function check(name) {
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const de = document.documentElement; const over = de.scrollWidth > de.clientWidth + 1;
      const clipped = [...document.querySelectorAll('button,.btn,.input,h1,h2,h3,.card__title')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible').map((e) => e.className + ':' + (e.textContent || '').slice(0, 20));
      return { over, sw: de.scrollWidth, clipped, h1: (document.querySelector('h1,.app-header__title') || {}).textContent, bodyLen: document.body.innerText.length };
    });
    const ok = !r.over && r.clipped.length === 0 && r.bodyLen > 20;
    if (!ok) bad.push(name);
    console.log((ok ? 'PASS ' : 'FAIL ') + name + ' url=' + page.url().replace(URL, '') + ' ' + JSON.stringify(r));
    await page.screenshot({ path: OUT + 'desktop-' + name + '.png' });
  }
  await check('today');
  // click through side nav by link text/href
  const hrefs = await page.locator('.side-nav a, aside a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.textContent.trim()]));
  console.log('side nav', JSON.stringify(hrefs));
  for (const [h, txt] of hrefs) {
    await page.locator(`.side-nav a[href="${h}"], aside a[href="${h}"]`).first().click();
    await page.waitForTimeout(500);
    const ok = page.url().endsWith(h);
    if (!ok) bad.push('nav ' + h);
    console.log((ok ? 'PASS ' : 'FAIL ') + 'sidenav click ' + txt + ' -> ' + page.url().replace(URL, ''));
    await check('nav' + h.replace(/\//g, '-'));
  }
  for (const [n, p] of [['calendar', '/calendar'], ['task-detail', '/tasks/k-4'], ['task-detail-k1', '/tasks/k-1'], ['clients', '/clients'], ['templates', '/templates'], ['settings', '/settings']]) {
    await page.goto(URL + p); await check(n);
  }
  await browser.close();
  console.log('CONSOLE ERRORS', errs.length, JSON.stringify(errs.slice(0, 8)));
  console.log(bad.length ? 'FAILS: ' + bad.join(',') : 'ALL PASS');
})();

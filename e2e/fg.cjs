const { chromium } = require('playwright');
const L = require('./libf.cjs');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(L.URL + '/');
  await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0);
  await page.waitForTimeout(2000);
  await L.as(page, 'u-wa');
  await L.lang(page, 'ur');
  await page.locator('button.btn--danger').click();
  await page.waitForTimeout(1500);
  console.log('after signout url', page.url());
  if (!/login/.test(page.url())) await page.goto(L.URL + '/login');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, sw: document.documentElement.scrollWidth, text: document.body.innerText.slice(0, 200) }));
  console.log('login ur', JSON.stringify(r));
  await page.screenshot({ path: __dirname + '/shots-final/U2-ur-login.png', fullPage: true });
  // input clipping detail on settings
  await page.evaluate(() => window.__demo.setActiveUser('u-mgr'));
  await page.goto(L.URL + '/settings'); await page.waitForTimeout(800);
  const c = await page.evaluate(() => [...document.querySelectorAll('input.input')].map((i) => ({ type: i.type, ph: i.placeholder, sh: i.scrollHeight, ch: i.clientHeight, lh: getComputedStyle(i).lineHeight, pad: getComputedStyle(i).paddingBlock })));
  console.log('settings inputs', JSON.stringify(c));
  await page.goto(L.URL + '/today'); await page.waitForTimeout(800);
  const h = await page.evaluate(() => { const e = document.querySelector('.hero'); const kids = [...e.children].map((k) => { const r = k.getBoundingClientRect(); return [k.className, Math.round(r.top), Math.round(r.bottom)]; }); const r = e.getBoundingClientRect(); return { hero: [Math.round(r.top), Math.round(r.bottom)], kids, overflow: getComputedStyle(e).overflow }; });
  console.log('hero', JSON.stringify(h));
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });

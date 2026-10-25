const { chromium } = require('playwright');
const URL = 'http://localhost:5399';
const DIR = require('path').join(__dirname, 'shots-final') + '/';
async function open() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(URL + '/');
  await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(2000);
  return { browser, ctx, page };
}
async function as(page, id) {
  await page.evaluate((i) => window.__demo.setActiveUser(i), id);
  await page.goto(URL + '/today'); await page.waitForTimeout(600);
}
async function lang(page, l) {
  await page.goto(URL + '/settings'); await page.waitForTimeout(600);
  await page.locator('button.btn--block').nth({ en: 0, ar: 1, ur: 2 }[l]).click();
  await page.waitForTimeout(500);
}
async function nav(page, p) {
  // client-side nav to keep in-memory state (language) intact
  await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, p);
  await page.waitForTimeout(700);
}
const shot = (page, n) => page.screenshot({ path: DIR + n + '.png' });
async function makeFile(page, w, h, q) {
  return page.evaluate(async ([w, h, q]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    for (let i = 0; i < 600; i++) { x.fillStyle = `hsl(${Math.random()*360},80%,50%)`; x.fillRect(Math.random()*w, Math.random()*h, Math.random()*w/4, Math.random()*h/4); }
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const v of buf) s += String.fromCharCode(v);
    return btoa(s);
  }, [w, h, q]);
}
module.exports = { open, as, lang, nav, shot, makeFile, URL };

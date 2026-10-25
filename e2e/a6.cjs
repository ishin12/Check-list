const L = require('./lib.cjs');
const log = (...a) => console.log(...a);
async function ovf(page, n) {
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth; const bad = [];
    document.querySelectorAll('body *').forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1)) bad.push(e.className + ':' + Math.round(b.left) + '-' + Math.round(b.right)); });
    const trunc = [...document.querySelectorAll('button,.banner,p,span')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => e.className);
    return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 6), trunc: trunc.slice(0, 6) };
  });
  log(n, JSON.stringify(r));
}
(async () => {
  const { browser, ctx, page } = await L.open();
  await L.as(page, 'u-wa');
  await L.lang(page, 'ar');
  log('dir', await page.evaluate(() => document.documentElement.dir));
  await L.nav(page, '/tasks/k-1/capture/finish');
  await L.shot(page, 'A6-1-ar-capture-empty'); await ovf(page, 'capture-empty');
  const small = Buffer.from(await L.makeFile(page, 3000, 2000, 0.8), 'base64');
  await page.setInputFiles('input[type=file]', { name: 'a.jpg', mimeType: 'image/jpeg', buffer: small }); await page.waitForTimeout(400);
  await L.shot(page, 'A6-2-ar-preview'); await ovf(page, 'preview');
  await page.setInputFiles('input[type=file]', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }); await page.waitForTimeout(300);
  await L.shot(page, 'A6-3-ar-error-wrongtype'); await ovf(page, 'err-wrongtype');
  await page.setInputFiles('input[type=file]', { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('nope') }); await page.waitForTimeout(300);
  await page.locator('.capture__actions .btn--primary').click(); await page.waitForTimeout(800);
  await L.shot(page, 'A6-4-ar-error-decode'); await ovf(page, 'err-decode');
  await page.setInputFiles('input[type=file]', { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(26 * 1024 * 1024, 1) }); await page.waitForTimeout(500);
  await L.shot(page, 'A6-5-ar-error-toolarge'); await ovf(page, 'err-toolarge');
  // offline save in Arabic
  await page.setInputFiles('input[type=file]', { name: 'a.jpg', mimeType: 'image/jpeg', buffer: small }); await page.waitForTimeout(300);
  await ctx.setOffline(true);
  await page.locator('.capture__actions .btn--primary').click(); await page.waitForTimeout(1000);
  await L.shot(page, 'A6-6-ar-saved-offline'); await ovf(page, 'saved-offline');
  await page.getByRole('button').filter({ hasText: /./ }).last().click(); await page.waitForTimeout(800);
  await L.shot(page, 'A6-7-ar-task-waiting'); await ovf(page, 'task-waiting');
  await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForTimeout(1500);
  await L.shot(page, 'A6-8-ar-task-uploaded'); await ovf(page, 'task-uploaded');
  await page.locator('.proof-block__open').last().tap(); await page.waitForTimeout(700);
  await L.shot(page, 'A6-9-ar-viewer'); await ovf(page, 'viewer');
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });

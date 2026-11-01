// Usage: node e2e/phase2b-shots.cjs <outdir> [port] [langs=ar,en,ur] [widths=390,768,1440]
// Demo-mode dev server required (VITE_DEMO_MODE=1). Field-work screens, worker + manager.
const { chromium } = require('playwright');
const fs = require('fs');

const OUT = process.argv[2];
const URL = 'http://localhost:' + (process.argv[3] || 5182);
const LANGS = (process.argv[4] || 'ar,en,ur').split(',');
const WIDTHS = (process.argv[5] || '390,768,1440').split(',').map(Number);
fs.mkdirSync(OUT, { recursive: true });

// [name, path, user]
const SCREENS = [
  ['today-wrk', '/today', 'u-wa'],
  ['today-mgr', '/today', 'u-mgr'],
  ['calendar-wrk', '/calendar', 'u-wa'],
  ['calendar-mgr', '/calendar', 'u-mgr'],
  ['approvals-mgr', '/approvals', 'u-mgr'],
  ['notifications-wrk', '/notifications', 'u-wa'],
  ['task-notstarted-wrk', '/tasks/k-1', 'u-wa'],
  ['task-inprogress-wrk', '/tasks/k-2', 'u-wa'],
  ['task-submitted-mgr', '/tasks/k-4', 'u-mgr'],
  ['task-approved-mgr', '/tasks/k-5', 'u-mgr'],
  ['task-rejected-wrk', '/tasks/k-6', 'u-wa'],
  ['task-new-mgr', '/tasks/new', 'u-mgr'],
  ['capture-wrk', '/tasks/k-2/capture/finish', 'u-wa'],
  ['capture-preview-wrk', 'PREVIEW', 'u-wa'],
  ['home-mgr', '/home', 'u-mgr'],
  ['job-mgr', 'JOB', 'u-mgr'],
];

const CHECK = () => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth) out.push('hscroll ' + de.scrollWidth + '>' + innerWidth);
  for (const el of document.querySelectorAll('body *')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) {
      if (!el.closest('.tab-bar,.side-nav')) out.push('offscreen: ' + el.tagName + '.' + el.className);
    }
    if ((el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SELECT' || el.tagName === 'INPUT') && r.height > 0 && (r.height < 43.5 || r.width < 43.5)
      && !(el.tagName === 'INPUT' && (el.type === 'file' || el.type === 'checkbox')))
      out.push('small target ' + Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + el.tagName + '.' + el.className);
    if ((cs.overflow === 'hidden' || cs.overflowY === 'hidden') && cs.textOverflow !== 'ellipsis' && cs.webkitLineClamp === 'none'
      && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && el.textContent.trim() && !el.querySelector('canvas,img,video'))
      out.push('clipped: ' + el.tagName + '.' + el.className + ' ' + el.scrollHeight + '>' + el.clientHeight);
  }
  return out;
};

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const lang of LANGS) for (const w of WIDTHS) {
    const mobile = w < 700;
    const ctx = await browser.newContext({
      viewport: { width: w, height: mobile ? 844 : w >= 1024 ? 900 : 1024 },
      deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
    });
    await ctx.addInitScript((l) => { try { localStorage.setItem('checklist.settings.v1', JSON.stringify({ language: l })); } catch (e) {} }, lang);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR', lang, w, e.message));
    await page.goto(URL + '/login');
    await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    const nav = async (p) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, p); };
    let user = null;
    for (const [name, path, u] of SCREENS) {
      if (u !== user) { await page.evaluate((i) => window.__demo.setActiveUser(i), u); user = u; await nav('/today'); await page.waitForTimeout(500); }
      if (path === 'JOB') {
        await nav('/home'); await page.waitForTimeout(600);
        const card = page.locator('button.card--tap').first();
        if (await card.count()) { await card.click(); await page.waitForTimeout(600); }
      } else if (path === 'PREVIEW') {
        await nav('/tasks/k-2/capture/finish'); await page.waitForTimeout(600);
        const b64 = await page.evaluate(async () => {
          const c = document.createElement('canvas'); c.width = 640; c.height = 480;
          const x = c.getContext('2d'); x.fillStyle = '#6a8f6f'; x.fillRect(0, 0, 640, 480);
          x.fillStyle = '#d9e7d2'; x.fillRect(60, 80, 300, 220); x.fillStyle = '#3b5d44'; x.fillRect(360, 200, 200, 200);
          const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
          const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const v of buf) s += String.fromCharCode(v);
          return btoa(s);
        });
        await page.setInputFiles('input.capture__input', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
      } else { await nav(path); }
      await page.waitForTimeout(900);
      await page.evaluate(() => window.scrollTo(0, 0));
      const file = `${OUT}/${lang}-${w}-${name}.png`;
      await page.screenshot({ path: file, fullPage: false });
      if (process.env.FULL) await page.screenshot({ path: file.replace('.png', '-full.png'), fullPage: true });
      const r = await page.evaluate(CHECK);
      if (r.length) problems.push(`${lang}-${w}-${name}: ` + [...new Set(r)].slice(0, 6).join(' | '));
    }
    await ctx.close();
  }
  await browser.close();
  console.log('PROBLEMS', problems.length); problems.forEach((p) => console.log(p));
})();

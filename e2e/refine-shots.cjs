// Usage: node e2e/refine-shots.cjs <outdirname> [port]   (demo-mode dev server)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, process.argv[2] || 'shots-after');
const URL = 'http://localhost:' + (process.argv[3] || 5499);
fs.mkdirSync(OUT, { recursive: true });
const TOKEN = 'demoSignToken000000000000000000000000a1';
const mgr = [
  ['today', '/today'], ['calendar', '/calendar'], ['task-k1', '/tasks/k-1'], ['task-k2', '/tasks/k-2'],
  ['task-k4', '/tasks/k-4'], ['task-new', '/tasks/new'], ['capture', '/tasks/k-2/capture/photo'],
  ['notifications', '/notifications'], ['settings', '/settings'], ['templates', '/templates'],
  ['template-editor', '/templates/t-ac'], ['clients', '/clients'], ['client-detail', '/clients/c-1'],
  ['approvals', '/approvals'],
];
const wrk = [
  ['today', '/today'], ['calendar', '/calendar'], ['task-k1', '/tasks/k-1'], ['task-k2', '/tasks/k-2'],
  ['notifications', '/notifications'], ['settings', '/settings'],
];
const CHECK = () => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth) out.push('hscroll ' + de.scrollWidth + '>' + innerWidth);
  for (const el of document.querySelectorAll('body *')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.color === 'rgb(0, 0, 238)') out.push('blue link: ' + el.tagName + '.' + el.className);
    if (el.tagName === 'A' && cs.textDecorationLine.includes('underline') && el.closest('.card, .timeline__item, .tab-bar, .side-nav'))
      out.push('underlined card link: ' + el.className);
    if ((cs.overflow === 'hidden' || cs.overflowY === 'hidden') && cs.textOverflow !== 'ellipsis' && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && el.textContent.trim() && !el.querySelector('canvas,img,video'))
      out.push('clipped: ' + el.tagName + '.' + el.className + ' ' + el.scrollHeight + '>' + el.clientHeight);
  }
  return out;
};
(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const lang of ['en', 'ar', 'ur']) for (const vp of ['m', 'd']) {
    const ctx = await browser.newContext(vp === 'm'
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((l) => { try { localStorage.setItem('checklist.settings.v1', JSON.stringify({ language: l })); } catch (e) {} }, lang);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await page.goto(URL + '/login');
    await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(2000);
    const snap = async (name) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${lang}-${vp}-${name}.png`, fullPage: false });
      const r = await page.evaluate(CHECK);
      if (r.length) problems.push(`${lang}-${vp}-${name}: ` + [...new Set(r)].slice(0, 6).join(' | '));
    };
    const nav = async (p) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, p); };
    await page.evaluate((i) => window.__demo.setActiveUser(i), 'u-mgr');
    await nav('/today'); await page.waitForTimeout(500);
    for (const [n, p] of mgr) { await nav(p); await snap('mgr-' + n); }
    await page.evaluate((i) => window.__demo.setActiveUser(i), 'u-wa');
    await nav('/today'); await page.waitForTimeout(500);
    for (const [n, p] of wrk) { await nav(p); await snap('wrk-' + n); }
    await page.evaluate((i) => window.__demo.setActiveUser(i), 'u-mgr');
    await nav('/sign/' + TOKEN); await snap('sign');
    await nav('/settings'); await page.waitForTimeout(500);
    await page.locator('button.btn--danger.btn--block').click(); await page.waitForTimeout(800);
    await snap('login');
    await ctx.close();
  }
  await browser.close();
  console.log('PROBLEMS', problems.length); problems.forEach((p) => console.log(p));
})();

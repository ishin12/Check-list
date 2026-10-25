const { chromium } = require('playwright');
const L = require('./libf.cjs');
const fs = require('fs');
const log = (...a) => console.log(...a);
const SHOTS = L.URL && require('path').join(__dirname, 'shots-final') + '/';

const CHECK = () => {
  const W = 390;
  const out = { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, over: [], clip: [], arabicIndic: false, lang: document.documentElement.lang, dir: document.documentElement.dir };
  const txt = document.body.innerText;
  out.arabicIndic = /[٠-٩۰-۹]/.test(txt);
  const desc = (e) => (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '') + ' "' + (e.innerText || '').trim().slice(0, 30).replace(/\n/g, ' ') + '"');
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(e);
    if (cs.position === 'fixed' && false) continue;
    // ignore things inside horizontally scrollable containers
    let p = e.parentElement, inScroll = false;
    while (p && p !== document.body) { const pc = getComputedStyle(p); if (/(auto|scroll)/.test(pc.overflowX) && p.scrollWidth > p.clientWidth) { inScroll = true; break; } p = p.parentElement; }
    if (!inScroll && (r.right > W + 1 || r.left < -1) && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('.capture__input')) out.over.push(desc(e) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
    if (/(hidden|clip)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0) out.clip.push(desc(e) + ` [scrollH ${e.scrollHeight} > clientH ${e.clientHeight}]`);
  }
  out.over = out.over.slice(0, 8); out.clip = out.clip.slice(0, 8);
  return out;
};

async function run(browser, lang, role) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(L.URL + '/');
  await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(2000);
  const uid = role === 'mgr' ? 'u-mgr' : 'u-wa';
  await L.as(page, uid);
  await L.lang(page, lang);
  const screens = role === 'mgr'
    ? [['today', '/today'], ['calendar', '/calendar'], ['task-k1-location', '/tasks/k-1'], ['task-k2-workers-photos', '/tasks/k-2'], ['task-k4-photos', '/tasks/k-4'], ['capture', '/tasks/k-1/capture/start'], ['new-task', '/tasks/new'], ['notifications', '/notifications'], ['settings', '/settings'], ['templates', '/templates'], ['template-editor', '/templates/t-ac'], ['clients', '/clients'], ['client-detail', '/clients/c-1'], ['approvals', '/approvals'], ['users', '/users'], ['sign', '/sign/demoSignToken000000000000000000000000a1'], ['audit', '/audit'], ['home', '/home']]
    : [['today', '/today'], ['calendar', '/calendar'], ['task-k1-location', '/tasks/k-1'], ['task-k2-workers-photos', '/tasks/k-2'], ['capture', '/tasks/k-1/capture/start'], ['notifications', '/notifications'], ['settings', '/settings'], ['sign', '/sign/demoSignToken000000000000000000000000a1']];
  const results = [];
  for (const [name, path] of screens) {
    await L.nav(page, path); await page.waitForTimeout(500);
    if (name === 'task-k2-workers-photos' && role === 'mgr') { try { await page.getByRole('button', { name: /^(Edit workers|.*)$/ }).first(); } catch {} }
    const r = await page.evaluate(CHECK);
    results.push([name, r]);
    await page.screenshot({ path: SHOTS + `U2-${lang}-${role}-${name}.png`, fullPage: true });
    const flags = [];
    if (r.sw > 390) flags.push('H-OVERFLOW sw=' + r.sw);
    if (r.over.length) flags.push('OVER:' + JSON.stringify(r.over));
    if (r.clip.length) flags.push('CLIP:' + JSON.stringify(r.clip));
    if (lang === 'ur' && r.arabicIndic) flags.push('NON-WESTERN-DIGITS');
    log(`[${lang}/${role}] ${name} lang=${r.lang} dir=${r.dir} sw=${r.sw} ${flags.length ? flags.join(' | ') : 'ok'}`);
  }
  // login
  await page.evaluate(() => window.__demo.setActiveUser && window.__demo.setActiveUser(null)).catch(() => {});
  await page.goto(L.URL + '/login'); await page.waitForTimeout(800);
  const r = await page.evaluate(CHECK);
  await page.screenshot({ path: SHOTS + `U2-${lang}-${role}-login.png`, fullPage: true });
  log(`[${lang}/${role}] login url=${page.url()} lang=${r.lang} dir=${r.dir} sw=${r.sw} over=${JSON.stringify(r.over)} clip=${JSON.stringify(r.clip)}`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  // U1
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(L.URL + '/');
    await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0);
    await page.waitForTimeout(2000);
    await L.as(page, 'u-wa');
    await L.lang(page, 'ur');
    await L.shot(page, 'U1-settings-ur');
    const r = await page.evaluate(async () => {
      const cs = getComputedStyle(document.body);
      const lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize);
      let fontsOk; try { await document.fonts.ready; fontsOk = [...document.fonts].map((f) => f.family + ':' + f.status).filter((s) => /Nastaliq/.test(s)); } catch (e) { fontsOk = String(e); }
      return { lang: document.documentElement.lang, dir: document.documentElement.dir, fontFamily: cs.fontFamily, lineHeight: cs.lineHeight, ratio: lh / fs, fontSize: cs.fontSize, nastaliqFaces: fontsOk, check: document.fonts.check('16px "Noto Nastaliq Urdu"', 'اردو'), btnFont: getComputedStyle(document.querySelector('button')).fontFamily };
    });
    log('U1', JSON.stringify(r));
    // persists after reload?
    await page.reload(); await page.waitForTimeout(800);
    log('U1 after reload', await page.evaluate(() => document.documentElement.lang + ' ' + document.documentElement.dir));
    await L.lang(page, 'ar'); log('U4 ar html', await page.evaluate(() => document.documentElement.lang + ' ' + document.documentElement.dir + ' ' + getComputedStyle(document.body).fontFamily + ' lh=' + getComputedStyle(document.body).lineHeight));
    await L.lang(page, 'en'); log('U4 en html', await page.evaluate(() => document.documentElement.lang + ' ' + document.documentElement.dir + ' ' + getComputedStyle(document.body).fontFamily + ' lh=' + getComputedStyle(document.body).lineHeight));
    await ctx.close();
  }
  for (const role of ['mgr', 'wa']) await run(browser, 'ur', role);
  for (const lang of ['en', 'ar']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(L.URL + '/');
    await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0);
    await page.waitForTimeout(2000);
    await L.as(page, 'u-mgr'); await L.lang(page, lang);
    for (const [n, p] of [['today', '/today'], ['task-k2', '/tasks/k-2'], ['task-k1', '/tasks/k-1'], ['new-task', '/tasks/new']]) {
      await L.nav(page, p); await page.waitForTimeout(400);
      const r = await page.evaluate(CHECK);
      await page.screenshot({ path: SHOTS + `U4-${lang}-${n}.png`, fullPage: true });
      log(`U4 ${lang} ${n} lang=${r.lang} dir=${r.dir} sw=${r.sw} over=${r.over.length} clip=${r.clip.length}`);
    }
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });

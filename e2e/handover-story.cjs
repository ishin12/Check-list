// End-to-end story per language at 390px (demo mode, port 5799).
const L = require('./libf.cjs');
const path = require('path');
const OUT = path.join(__dirname, 'shots-handover') + '/';
const idb = (page, store) => page.evaluate((s) => new Promise((res) => {
  const r = indexedDB.open('checklist-demo');
  r.onsuccess = () => { const db = r.result; const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => { db.close(); res(q.result); }; };
}), store);
const results = [];
const rec = (ok, n, ev) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ev ? ' :: ' + ev : '')); };
const consoleErrs = [];
async function run(lg) {
  const { browser, page } = await L.open();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(lg + ' ' + m.text()); });
  page.on('pageerror', (e) => consoleErrs.push(lg + ' PAGEERROR ' + e.message));
  const shot = (n) => page.screenshot({ path: OUT + lg + '-' + n + '.png' });
  await L.as(page, 'u-mgr'); await L.lang(page, lg);
  await L.nav(page, '/tasks/new'); await shot('1-new');
  const title = 'Story ' + lg + ' ' + Date.now();
  await page.locator('input.input[required]').first().fill(title);
  await page.locator('select').first().selectOption({ index: 1 });
  const items = page.locator('.worker-select__item input');
  await items.nth(0).check(); await items.nth(1).check();
  await page.locator('select').nth(2).selectOption('weekly');
  await page.locator('.location-input__text').fill('https://www.google.com/maps/@24.7136,46.6753,15z');
  await page.waitForTimeout(400);
  await shot('2-new-filled');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/tasks\/(?!new)[^/]+$/); await page.waitForTimeout(800);
  const tid = page.url().split('/').pop();
  await shot('3-created');
  const tw = (await idb(page, 'task_workers')).filter((r) => r.task_id === tid).map((r) => r.worker_id);
  let t = (await idb(page, 'tasks')).find((x) => x.id === tid);
  rec(tw.length === 2 && t.recurrence === 'weekly' && t.location_lat === 24.7136, lg + ' manager created job', JSON.stringify({ tw, rec: t.recurrence, lat: t.location_lat, lng: t.location_lng }));
  const wA = tw[0];
  await L.as(page, wA); await page.goto(L.URL + '/tasks/' + tid); await page.waitForTimeout(900);
  const body = await page.evaluate(() => document.body.innerText);
  const links = await page.locator('a[href*="google.com/maps"]').count();
  rec(body.includes(title) && links >= 1, lg + ' worker A sees job + map links', 'maps links=' + links);
  await shot('4-worker-detail');
  await page.locator('.action-bar button').first().click();
  await page.waitForURL(/capture\/start/); await page.waitForTimeout(600);
  await shot('5-capture-start');
  const mk = async () => Buffer.from(await L.makeFile(page, 1200, 900, 0.8), 'base64');
  await page.setInputFiles('input[type=file]', { name: 's.jpg', mimeType: 'image/jpeg', buffer: await mk() });
  await page.waitForTimeout(600); await shot('6-start-preview');
  await page.locator('button.btn--primary.btn--block').click();
  await page.waitForURL(new RegExp('/tasks/' + tid + '$'), { timeout: 10000 }); await page.waitForTimeout(900);
  t = (await idb(page, 'tasks')).find((x) => x.id === tid);
  let pr = (await idb(page, 'task_proofs')).filter((p) => p.task_id === tid).map((p) => p.kind);
  rec(t.status === 'in_progress' && pr.includes('start'), lg + ' start via photo', t.status + ' ' + pr);
  await shot('7-in-progress');
  await page.locator('.action-bar button').first().click();
  await page.waitForURL(/capture\/finish/); await page.waitForTimeout(600);
  await page.setInputFiles('input[type=file]', { name: 'f.jpg', mimeType: 'image/jpeg', buffer: await mk() });
  await page.waitForTimeout(600);
  await page.locator('button.btn--primary.btn--block').click();
  await page.waitForURL(new RegExp('/tasks/' + tid + '$'), { timeout: 10000 }); await page.waitForTimeout(1200);
  t = (await idb(page, 'tasks')).find((x) => x.id === tid);
  pr = (await idb(page, 'task_proofs')).filter((p) => p.task_id === tid).map((p) => p.kind);
  rec(t.status === 'submitted' && pr.includes('finish'), lg + ' submit via finish photo', t.status + ' ' + pr);
  await shot('8-submitted');
  await L.as(page, 'u-mgr'); await page.goto(L.URL + '/tasks/' + tid); await page.waitForTimeout(900);
  await shot('9-manager-review');
  await page.locator('.action-bar button').first().click(); await page.waitForTimeout(1500);
  t = (await idb(page, 'tasks')).find((x) => x.id === tid);
  rec(t.status === 'approved', lg + ' manager approved', t.status);
  await shot('10-approved');
  const all = await idb(page, 'tasks');
  const next = all.find((x) => x.series_id === (t.series_id || t.id) && x.id !== tid);
  const nw = next ? (await idb(page, 'task_workers')).filter((r) => r.task_id === next.id).map((r) => r.worker_id) : [];
  const days = next ? Math.round((new Date(next.scheduled_at) - new Date(t.scheduled_at)) / 864e5) : null;
  rec(!!next && days === 7 && JSON.stringify([...nw].sort()) === JSON.stringify([...tw].sort()) && next.location_lat === 24.7136 && next.status === 'not_started' && next.assigned_worker_id === t.assigned_worker_id,
    lg + ' recurring next visit', next ? JSON.stringify({ days, nw, lat: next.location_lat, url: next.location_url, status: next.status }) : 'none');
  if (next) { await page.goto(L.URL + '/tasks/' + next.id); await page.waitForTimeout(800); await shot('11-next-visit'); }
  await browser.close();
}
(async () => {
  for (const lg of ['en', 'ar', 'ur']) { try { await run(lg); } catch (e) { rec(false, lg + ' exception', e.message.split('\n')[0]); } }
  console.log('CONSOLE ERRORS', consoleErrs.length, JSON.stringify(consoleErrs.slice(0, 10)));
  console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAIL');
})();

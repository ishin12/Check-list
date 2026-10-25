const L = require('./lib.cjs');
const log = (...a) => console.log(...a);
async function blobs(page) {
  return page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('checklist-demo');
    r.onsuccess = () => {
      const db = r.result; const out = [];
      const tx = db.transaction('blobs'); const st = tx.objectStore('blobs');
      const kr = st.getAllKeys(); const vr = st.getAll();
      tx.oncomplete = () => { kr.result.forEach((k, i) => out.push([k, vr.result[i].size, vr.result[i].type])); db.close(); res(out); };
    };
  }));
}
async function proofs(page, task) {
  return page.evaluate(async (t) => {
    return new Promise((res) => {
      const r = indexedDB.open('checklist-demo');
      r.onsuccess = () => { const db = r.result; const q = db.transaction('task_proofs').objectStore('task_proofs').getAll(); q.onsuccess = () => { db.close(); res(q.result.filter((p) => p.task_id === t).map((p) => [p.kind, p.storage_path, p.mime])); }; };
    });
  }, task);
}
async function status(page, task) {
  return page.evaluate(async (t) => new Promise((res) => {
    const r = indexedDB.open('checklist-demo');
    r.onsuccess = () => { const db = r.result; const q = db.transaction('tasks').objectStore('tasks').get(t); q.onsuccess = () => { db.close(); res(q.result && q.result.status); }; };
  }), task);
}
async function setFile(page, name, mime, buf) {
  await page.setInputFiles('input[type=file]', { name, mimeType: mime, buffer: buf });
}
(async () => {
  const { browser, ctx, page } = await L.open();
  await L.as(page, 'u-wa');
  // ---- A1 success
  log('seeded blobs', JSON.stringify((await blobs(page)).length));
  await page.goto(L.URL + '/tasks/k-1/capture/start?auto=1'); await page.waitForTimeout(700);
  await L.shot(page, 'A1-1-capture-empty');
  const b64 = await L.makeFile(page, 4000, 3000, 0.95);
  const big = Buffer.from(b64, 'base64'); log('A1 input bytes', big.length);
  await setFile(page, 'big.jpg', 'image/jpeg', big);
  await page.waitForTimeout(500);
  await L.shot(page, 'A1-2-preview');
  // watch progress
  const seen = [];
  const poll = setInterval(async () => { try { const t = await page.locator('[role=progressbar]').first().getAttribute('aria-valuenow', { timeout: 50 }); if (t) seen.push(t); } catch {} }, 20);
  await page.getByRole('button', { name: /Use this/ }).click();
  await page.waitForTimeout(100); await L.shot(page, 'A1-3-progress');
  await page.waitForURL(/\/tasks\/k-1$/, { timeout: 10000 });
  clearInterval(poll);
  log('A1 progress values seen', seen.join(','));
  await page.waitForTimeout(800);
  log('A1 status after', await status(page, 'k-1'), 'proofs', JSON.stringify(await proofs(page, 'k-1')));
  const bl = (await blobs(page)).filter((b) => b[0].startsWith('k-1/'));
  log('A1 stored blobs', JSON.stringify(bl));
  // dimensions of stored blob
  const dim = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('checklist-demo'); r.onsuccess = async () => {
      const db = r.result; const tx = db.transaction('blobs'); const st = tx.objectStore('blobs'); const k = st.getAllKeys(); const v = st.getAll();
      tx.oncomplete = async () => { const i = k.result.findIndex((x) => x.startsWith('k-1/')); const bmp = await createImageBitmap(v.result[i]); res([bmp.width, bmp.height]); };
    };
  }));
  log('A1 stored dims', dim);
  await L.shot(page, 'A1-4-task-with-thumb');
  const thumb = page.locator('.proof-block__open').first();
  await thumb.tap(); await page.waitForTimeout(700);
  await L.shot(page, 'A1-5-viewer');
  log('A1 viewer visible', await page.locator('.viewer').isVisible(), 'img', await page.locator('.viewer img').count());
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  log('A1 viewer closed by Esc', !(await page.locator('.viewer').count()));
  await thumb.tap(); await page.waitForTimeout(500);
  await page.locator('.viewer__close').tap(); await page.waitForTimeout(300);
  log('A1 viewer closed by button', !(await page.locator('.viewer').count()));

  // ---- A2 too large + A3 wrong type (on k-3? use Sara's task k-3 as worker wb? use wa on k-2 in_progress finish)
  await page.goto(L.URL + '/tasks/k-2/capture/finish?auto=1'); await page.waitForTimeout(700);
  const huge = Buffer.alloc(26 * 1024 * 1024, 1);
  await setFile(page, 'huge.jpg', 'image/jpeg', huge); await page.waitForTimeout(500);
  await L.shot(page, 'A2-too-large-image');
  log('A2 image error:', (await page.locator('[role=alert]').allInnerTexts()).join('|'), 'status', await status(page, 'k-2'), 'previewImg', await page.locator('.capture__media').count());
  require('fs').writeFileSync('/tmp/claude-0/huge.mp4', Buffer.alloc(51*1024*1024,1));
  await page.setInputFiles('input[type=file]', '/tmp/claude-0/huge.mp4'); await page.waitForTimeout(500);
  log('A2 video error:', (await page.locator('[role=alert]').allInnerTexts()).join('|'), 'status', await status(page, 'k-2'));
  await setFile(page, 'a.txt', 'text/plain', Buffer.from('hello')); await page.waitForTimeout(400);
  await L.shot(page, 'A3-wrong-type-txt');
  log('A3 txt error:', (await page.locator('[role=alert]').allInnerTexts()).join('|'));
  await setFile(page, 'a.pdf', 'application/pdf', Buffer.from('%PDF-1.4')); await page.waitForTimeout(400);
  log('A3 pdf error:', (await page.locator('[role=alert]').allInnerTexts()).join('|'));
  await setFile(page, 'fake.jpg', 'image/jpeg', Buffer.from('not really an image')); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Use this/ }).click(); await page.waitForTimeout(1200);
  await L.shot(page, 'A3-decode-error');
  log('A3 corrupt jpg error:', (await page.locator('[role=alert]').allInnerTexts()).join('|'), 'status', await status(page, 'k-2'), 'url', page.url());

  // ---- A4 offline
  await page.goto(L.URL + '/tasks/k-2/capture/finish?auto=1'); await page.waitForTimeout(700);
  const small = Buffer.from(await L.makeFile(page, 800, 600, 0.8), 'base64');
  await ctx.setOffline(true); await page.waitForTimeout(300);
  await L.shot(page, 'A4-1-offline-hint');
  log('A4 offline hint:', (await page.locator('.banner--info').allInnerTexts()).join('|'));
  await setFile(page, 'off.jpg', 'image/jpeg', small); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Use this/ }).click(); await page.waitForTimeout(1000);
  await L.shot(page, 'A4-2-saved-offline');
  log('A4 saved msg:', (await page.locator('[role=status]').allInnerTexts()).join('|'), 'status', await status(page, 'k-2'));
  await page.getByRole('button', { name: /Continue/ }).click(); await page.waitForTimeout(800);
  await L.shot(page, 'A4-3-task-waiting');
  log('A4 task text proof area:', (await page.locator('.proof-block').allInnerTexts()).join(' || '));
  log('A4 proofs before online', JSON.stringify(await proofs(page, 'k-2')));
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(2000);
  await L.shot(page, 'A4-4-after-online');
  log('A4 task text after:', (await page.locator('.proof-block').allInnerTexts()).join(' || '));
  log('A4 proofs after online', JSON.stringify(await proofs(page, 'k-2')));

  // ---- A5 replace on k-1 start
  const before = await proofs(page, 'k-1'); log('A5 before', JSON.stringify(before));
  await page.goto(L.URL + '/tasks/k-1'); await page.waitForTimeout(700);
  await page.locator('.proof-block__open').first().tap(); await page.waitForTimeout(500);
  await page.getByRole('link', { name: /Replace/ }).tap(); await page.waitForTimeout(700);
  log('A5 url', page.url());
  await setFile(page, 'new.jpg', 'image/jpeg', small); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Use this/ }).click();
  await page.waitForURL(/\/tasks\/k-1$/); await page.waitForTimeout(800);
  log('A5 after', JSON.stringify(await proofs(page, 'k-1')), 'blobs', JSON.stringify((await blobs(page)).filter((b) => b[0].startsWith('k-1/'))));
  // replace seeded svg proof (k-4 finish) as worker wa
  await page.goto(L.URL + '/tasks/k-4/capture/finish?replace=1'); await page.waitForTimeout(600);
  log('A5b k-4 before', JSON.stringify(await proofs(page, 'k-4')), 'status', await status(page, 'k-4'));
  await setFile(page, 'new2.jpg', 'image/jpeg', small); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Use this/ }).click();
  await page.waitForURL(/\/tasks\/k-4$/); await page.waitForTimeout(800);
  log('A5b k-4 after', JSON.stringify(await proofs(page, 'k-4')), 'status', await status(page, 'k-4'));

  // ---- A6 Arabic
  await L.lang(page, 'ar');
  log('A6 dir', await page.evaluate(() => document.documentElement.dir));
  await L.nav(page, '/tasks/k-3/capture/start');
  await L.as(page, 'u-wa').catch(() => {});
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });

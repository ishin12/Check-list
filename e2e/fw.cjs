const L = require('./libf.cjs');
const log = (...a) => console.log(...a);
const idb = (page, store) => page.evaluate((s) => new Promise((res) => {
  const r = indexedDB.open('checklist-demo');
  r.onsuccess = () => { const db = r.result; const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => { db.close(); res(q.result); }; };
}), store);
const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function newTask(page, title, workers, extra = {}) {
  await L.nav(page, '/tasks/new');
  await page.locator('input.input[required]').first().fill(title);
  await page.locator('select').first().selectOption({ index: 1 });
  for (const w of workers) await page.getByLabel(w, { exact: false }).first().check().catch(async () => { await page.locator('.worker-select__item', { hasText: w }).locator('input').check(); });
  if (extra.location) await page.locator('.location-input__text').fill(extra.location);
}

(async () => {
  const { browser, page } = await L.open();
  await L.as(page, 'u-mgr');
  // ---- W1
  await L.nav(page, '/tasks/new');
  await L.shot(page, 'W1-1-new-empty');
  const submit = page.getByRole('button', { name: /Create task/ });
  log('W1 initial: hint=', await page.locator('.field .hint', { hasText: 'at least one' }).count(), 'submit disabled', await submit.isDisabled());
  await page.locator('input.input[required]').first().fill('Two worker job');
  await page.locator('select').first().selectOption({ index: 1 });
  log('W1 title+client but 0 workers: submit disabled', await submit.isDisabled());
  log('W1 options', JSON.stringify(await page.locator('.worker-select__item').allInnerTexts()));
  await page.locator('input[type=search]').fill('sar');
  log('W1 search "sar" ->', JSON.stringify(await page.locator('.worker-select__item').allInnerTexts()));
  await page.getByRole('button', { name: 'Select all' }).click();
  log('W1 select all (filtered) count text:', await page.locator('.worker-select__bar .card__meta').innerText());
  await page.locator('input[type=search]').fill('');
  await page.getByRole('button', { name: 'Select all' }).click();
  log('W1 select all (all) count text:', await page.locator('.worker-select__bar .card__meta').innerText(), 'submit disabled', await submit.isDisabled());
  await L.shot(page, 'W1-2-two-selected');
  await page.getByRole('button', { name: 'Clear' }).click();
  log('W1 clear -> count', await page.locator('.worker-select__bar .card__meta').innerText(), 'submit disabled', await submit.isDisabled(), 'hint', await page.locator('.field .hint', { hasText: 'at least one' }).count());
  await L.shot(page, 'W1-3-cleared');
  await page.locator('.worker-select__item', { hasText: 'Sara' }).locator('input').check();
  await page.locator('.worker-select__item', { hasText: 'Ahmed' }).locator('input').check();
  const notifBefore = (await idb(page, 'notifications')).length;
  await submit.click(); await page.waitForURL(/\/tasks\/(?!new)[^/]+$/); await page.waitForTimeout(800);
  const tid = page.url().split('/').pop();
  await L.shot(page, 'W1-4-detail');
  log('W1 created', tid, 'who-line text:', (await bodyText(page)).split('\n').slice(0, 14).join(' / '));
  let tw = (await idb(page, 'task_workers')).filter((r) => r.task_id === tid);
  let task = (await idb(page, 'tasks')).find((t) => t.id === tid);
  log('W1 task_workers', JSON.stringify(tw.map((r) => r.worker_id)), 'lead(assigned_worker_id)=', task.assigned_worker_id, '(first picked = Sara=u-wb)');
  // ---- W4 notifications
  const notifs = (await idb(page, 'notifications')).filter((n) => n.payload && n.payload.task_id === tid);
  log('W4 notifications for new job:', JSON.stringify(notifs.map((n) => [n.user_id, n.kind])), 'added', (await idb(page, 'notifications')).length - notifBefore);
  // ---- W2 edit: remove lead
  await page.getByRole('button', { name: 'Edit workers' }).click(); await page.waitForTimeout(600);
  await L.shot(page, 'W2-1-edit-open');
  log('W2 checked', await page.locator('.worker-edit input:checked').count());
  await page.locator('.worker-edit .worker-select__item', { hasText: 'Sara' }).locator('input').uncheck();
  await page.getByRole('button', { name: 'Save workers' }).click(); await page.waitForTimeout(800);
  tw = (await idb(page, 'task_workers')).filter((r) => r.task_id === tid); task = (await idb(page, 'tasks')).find((t) => t.id === tid);
  log('W2 remove lead(Sara) -> workers', JSON.stringify(tw.map((r) => r.worker_id)), 'lead=', task.assigned_worker_id);
  await L.shot(page, 'W2-2-after-remove-lead');
  log('W2 UI who:', (await bodyText(page)).split('\n').slice(0, 10).join(' / '));
  // add Sara back
  await page.getByRole('button', { name: 'Edit workers' }).click(); await page.waitForTimeout(500);
  await page.locator('.worker-edit .worker-select__item', { hasText: 'Sara' }).locator('input').check();
  await page.getByRole('button', { name: 'Save workers' }).click(); await page.waitForTimeout(800);
  tw = (await idb(page, 'task_workers')).filter((r) => r.task_id === tid); task = (await idb(page, 'tasks')).find((t) => t.id === tid);
  log('W2 add Sara back -> workers', JSON.stringify(tw.map((r) => r.worker_id)), 'lead=', task.assigned_worker_id);
  const n2 = (await idb(page, 'notifications')).filter((n) => n.payload && n.payload.task_id === tid);
  log('W2/W4 notifications on job after edits:', JSON.stringify(n2.map((n) => [n.user_id, n.kind])));
  // remove all -> blocked
  await page.getByRole('button', { name: 'Edit workers' }).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Clear' }).click();
  log('W2 save disabled with none:', await page.getByRole('button', { name: 'Save workers' }).isDisabled());
  await L.shot(page, 'W2-3-none-blocked');
  await page.getByRole('button', { name: 'Cancel' }).click();
  // second job: Sara only
  await newTask(page, 'Sara only job', ['Sara']);
  await submit.click(); await page.waitForURL(/\/tasks\/(?!new)[^/]+$/); await page.waitForTimeout(600);
  const tid2 = page.url().split('/').pop();
  // ---- W3 seeded
  const seeded = await idb(page, 'tasks');
  const twAll = await idb(page, 'task_workers');
  log('W3 seeded k-1..k-7 task_workers:', JSON.stringify(['k-1','k-2','k-3','k-7'].map((k) => [k, (seeded.find(t=>t.id===k)||{}).assigned_worker_id, twAll.filter((r)=>r.task_id===k).map(r=>r.worker_id)])));
  for (const k of ['k-1', 'k-3']) {
    await L.nav(page, '/tasks/' + k); await L.shot(page, 'W3-' + k);
    log('W3', k, (await bodyText(page)).split('\n').slice(0, 8).join(' / '), '| Edit workers btn:', await page.getByRole('button', { name: 'Edit workers' }).count());
  }
  // ---- W4 worker views
  for (const [uid, name] of [['u-wa', 'Ahmed'], ['u-wb', 'Sara']]) {
    await L.as(page, uid);
    const t = await bodyText(page);
    log('W4', name, 'Today sees "Two worker job":', t.includes('Two worker job'), '"Sara only job":', t.includes('Sara only job'));
    await L.shot(page, 'W4-today-' + name);
    await L.nav(page, '/calendar'); const tc = await bodyText(page);
    log('W4', name, 'Calendar sees two:', tc.includes('Two worker job'), 'sara-only:', tc.includes('Sara only job'));
    await L.nav(page, '/notifications'); const tn = await bodyText(page);
    log('W4', name, 'notification rows mentioning Two worker job:', (tn.match(/Two worker job/g) || []).length, 'Sara only:', (tn.match(/Sara only job/g) || []).length);
    await L.shot(page, 'W4-notifs-' + name);
    await L.nav(page, '/tasks/' + tid2);
    log('W4', name, 'direct open of Sara-only job:', (await bodyText(page)).slice(0, 120).replace(/\n/g, ' / '));
    await L.nav(page, '/tasks/' + tid); log('W4', name, 'direct open of two-worker job:', (await bodyText(page)).slice(0, 100).replace(/\n/g, ' / '));
  }
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });

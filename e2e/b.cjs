const L = require('./lib.cjs');
const log = (...a) => console.log(...a);
const txt = async (page, sel = 'body') => (await page.locator(sel).innerText()).replace(/\n+/g, ' | ');
(async () => {
  const { browser, page } = await L.open();
  await L.as(page, 'u-mgr');
  // seeded single-worker (B4)
  await L.shot(page, 'B4-today-manager');
  log('B4/B2 today:', (await txt(page)).slice(0, 500));
  await page.goto(L.URL + '/tasks/new'); await page.waitForTimeout(700);
  await L.shot(page, 'B1-1-new-empty');
  log('B1 initial:', await txt(page, '.worker-select'), '| create disabled:', await page.getByRole('button', { name: /Create task/ }).isDisabled());
  await page.locator('input.input[required]').first().fill('Multi test job');
  await page.locator('select').first().selectOption({ index: 1 });
  log('B1 ready w/o worker, disabled:', await page.getByRole('button', { name: /Create task/ }).isDisabled(), 'hint:', await txt(page, '.hint').catch(() => ''));
  const search = page.locator('.worker-select input[type=search]');
  await search.fill('sar'); await page.waitForTimeout(200);
  log('B1 search sar:', await txt(page, '.worker-select__list'));
  await page.getByRole('button', { name: 'Select all' }).click();
  log('B1 select all (filtered):', await txt(page, '.worker-select__bar'), 'checked', await page.locator('.worker-select input:checked').count());
  await search.fill(''); await page.waitForTimeout(200);
  log('B1 after clear search checked:', await page.locator('.worker-select input:checked').count());
  await page.getByRole('button', { name: 'Select all' }).click();
  log('B1 select all (all):', await txt(page, '.worker-select__bar'));
  await page.getByRole('button', { name: 'Clear' }).click();
  log('B1 clear:', await txt(page, '.worker-select__bar'), 'disabled create', await page.getByRole('button', { name: /Create task/ }).isDisabled());
  await search.fill('zzz'); await page.waitForTimeout(200);
  log('B1 no match:', await txt(page, '.worker-select__list'));
  await search.fill('');
  // pick Sara first, then Ahmed -> lead Sara
  await page.locator('.worker-select label', { hasText: 'Sara' }).click();
  await page.locator('.worker-select label', { hasText: 'Ahmed' }).click();
  await L.shot(page, 'B1-2-two-selected');
  log('B1 count:', await txt(page, '.worker-select__bar'));
  await page.getByRole('button', { name: /Create task/ }).click();
  await page.waitForURL(/\/tasks\/(?!new)/); await page.waitForTimeout(800);
  const newUrl = page.url(); const newId = newUrl.split('/').pop(); log('created', newUrl);
  await L.shot(page, 'B2-1-detail-two-workers');
  log('B2 detail:', (await txt(page)).slice(0, 250));
  await page.goto(L.URL + '/today'); await page.waitForTimeout(700);
  await L.shot(page, 'B2-2-today');
  log('B2 today:', (await txt(page)).slice(0, 600));
  await page.goto(L.URL + '/calendar'); await page.waitForTimeout(700);
  await L.shot(page, 'B2-3-calendar'); log('B2 calendar:', (await txt(page)).slice(0, 500));
  await page.goto(L.URL + '/home'); await page.waitForTimeout(700);
  await L.shot(page, 'B2-4-home'); log('B2 home:', (await txt(page)).slice(0, 500));

  // B3 edit workers
  await page.goto(L.URL + '/tasks/' + newId); await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Edit workers/ }).click().catch(async () => page.getByText('Edit workers').click());
  await page.waitForTimeout(500);
  await L.shot(page, 'B3-1-edit-open');
  log('B3 edit panel:', await txt(page, '.worker-select'));
  // remove lead (Sara, picked first)
  await page.locator('.worker-select label', { hasText: 'Sara' }).click();
  log('B3 after uncheck Sara:', await txt(page, '.worker-select__bar'));
  await L.shot(page, 'B3-2-edit-removed');
  const save = page.getByRole('button', { name: 'Save workers' });
  await save.click(); await page.waitForTimeout(900);
  await L.shot(page, 'B3-3-after-remove-lead');
  log('B3 detail after removing Sara:', (await txt(page)).slice(0, 200));
  const dump = async () => page.evaluate(async (id) => new Promise((res) => { const r = indexedDB.open('checklist-demo'); r.onsuccess = () => { const db = r.result; const a = db.transaction('task_workers').objectStore('task_workers').getAll(); const b = db.transaction('tasks').objectStore('tasks').get(id); a.onsuccess = () => { b.onsuccess = () => { db.close(); res({ tw: a.result.filter((x) => x.task_id === id).map((x) => [x.worker_id, x.is_lead]), assigned: b.result.assigned_worker_id }); }; }; }; }), newId);
  log('B3 db:', JSON.stringify(await dump()));
  // add Sara back, then change to only Sara
  await page.getByText('Edit workers').click(); await page.waitForTimeout(400);
  await page.locator('.worker-select label', { hasText: 'Sara' }).click();
  await page.getByRole('button', { name: 'Save workers' }).click(); await page.waitForTimeout(900);
  log('B3 added Sara:', (await txt(page)).slice(0, 120), JSON.stringify(await dump()));
  await page.getByText('Edit workers').click(); await page.waitForTimeout(400);
  await page.locator('.worker-select label', { hasText: 'Ahmed' }).click();
  await page.getByRole('button', { name: 'Save workers' }).click(); await page.waitForTimeout(900);
  log('B3 only Sara:', (await txt(page)).slice(0, 120), JSON.stringify(await dump()));
  // try zero workers
  await page.getByText('Edit workers').click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Clear' }).click();
  log('B3 zero-workers save disabled:', await page.getByRole('button', { name: 'Save workers' }).isDisabled());
  await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
  // set back to both
  await page.getByText('Edit workers').click().catch(() => {}); await page.waitForTimeout(300);
  await page.locator('.worker-select label', { hasText: 'Ahmed' }).click().catch(() => {});
  await page.locator('.worker-select label', { hasText: 'Sara' }).click().catch(() => {});
  log('B3 state before final save:', await txt(page, '.worker-select__bar').catch(() => ''));
  await page.getByRole('button', { name: 'Save workers' }).click().catch(() => {}); await page.waitForTimeout(900);
  log('B3 final:', JSON.stringify(await dump()), (await txt(page)).slice(0, 120));

  // B5 worker views
  for (const [id, n] of [['u-wa', 'Ahmed'], ['u-wb', 'Sara']]) {
    await L.as(page, id);
    await L.shot(page, 'B5-today-' + n);
    log('B5', n, 'today has Multi:', (await txt(page)).includes('Multi test job'));
    await page.goto(L.URL + '/notifications'); await page.waitForTimeout(600);
    const t = await txt(page); await L.shot(page, 'B5-notif-' + n);
    log('B5', n, 'notif count of Multi test job:', (t.match(/Multi test job/g) || []).length, t.slice(0, 300));
  }
  // non-assigned: create a job with only Ahmed and check Sara
  await L.as(page, 'u-mgr');
  await page.goto(L.URL + '/tasks/new'); await page.waitForTimeout(600);
  await page.locator('input.input[required]').first().fill('Solo Ahmed job');
  await page.locator('select').first().selectOption({ index: 1 });
  await page.locator('.worker-select label', { hasText: 'Ahmed' }).click();
  await page.getByRole('button', { name: /Create task/ }).click(); await page.waitForTimeout(1000);
  const soloId = page.url().split('/').pop();
  await L.as(page, 'u-wb');
  const t2 = await txt(page); log('B5 Sara sees Solo Ahmed job on today:', t2.includes('Solo Ahmed'));
  await page.goto(L.URL + '/tasks/' + soloId); await page.waitForTimeout(700);
  log('B5 Sara direct URL to Ahmed-only task:', (await txt(page)).slice(0, 200));
  await L.shot(page, 'B5-sara-direct-ahmed-task');
  await page.goto(L.URL + '/calendar'); await page.waitForTimeout(600);
  log('B5 Sara calendar sees Solo:', (await txt(page)).includes('Solo Ahmed'));
  await L.as(page, 'u-wa');
  log('B5 Ahmed sees Solo:', (await txt(page)).includes('Solo Ahmed'));
  await page.goto(L.URL + '/notifications'); await page.waitForTimeout(600);
  log('B5 Ahmed notif Solo count:', ((await txt(page)).match(/Solo Ahmed job/g) || []).length);
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });

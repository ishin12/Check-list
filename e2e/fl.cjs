const { chromium } = require('playwright');
const L = require('./libf.cjs');
const log = (...a) => console.log(...a);
const idb = (page, store) => page.evaluate((s) => new Promise((res) => {
  const r = indexedDB.open('checklist-demo');
  r.onsuccess = () => { const db = r.result; const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => { db.close(); res(q.result); }; };
}), store);
const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function openCtx(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(L.URL + '/');
  await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(2000);
  return { ctx, page };
}

async function createWith(page, title, loc) {
  await L.nav(page, '/tasks/new');
  await page.locator('input.input[required]').first().fill(title);
  await page.locator('select').first().selectOption({ index: 1 });
  await page.locator('.worker-select__item', { hasText: 'Ahmed' }).locator('input').check();
  await page.locator('.location-input__text').fill(loc);
  await page.waitForTimeout(200);
  const fb = await page.locator('.location-input__feedback').allInnerTexts();
  const submit = page.getByRole('button', { name: /Create task/ });
  const disabled = await submit.isDisabled();
  return { fb, disabled, submit };
}

(async () => {
  const browser = await chromium.launch();
  {
    const { ctx, page } = await openCtx(browser);
    await L.as(page, 'u-mgr');
    const cases = [
      ['L1a', '24.7136, 46.6753'],
      ['L1b', 'https://www.google.com/maps/@24.7136,46.6753,15z'],
      ['L1c', 'https://www.google.com/maps/place/Foo/data=!3m1!4b1!4m6!3d24.8!4d46.7!16s'],
      ['L1d', 'https://maps.app.goo.gl/AbCdEf123'],
      ['L1e', 'http://example.com'],
    ];
    for (const [id, loc] of cases) {
      const r = await createWith(page, id + ' job', loc);
      log(id, JSON.stringify(loc), '| feedback:', JSON.stringify(r.fb), '| submit disabled:', r.disabled);
      await L.shot(page, id + '-form');
      if (!r.disabled) {
        await r.submit.click(); await page.waitForURL(/\/tasks\/(?!new)[^/]+$/); await page.waitForTimeout(700);
        const tid = page.url().split('/').pop();
        const t = (await idb(page, 'tasks')).find((x) => x.id === tid);
        log(id, 'saved:', JSON.stringify({ url: t.location_url, lat: t.location_lat, lng: t.location_lng }));
        const links = await page.evaluate(() => [...document.querySelectorAll('.location-card a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), target: a.target, rel: a.rel, deco: getComputedStyle(a).textDecorationLine })));
        log(id, 'detail links:', JSON.stringify(links));
        await L.shot(page, id + '-detail');
      }
    }
    // also k-1 and k-3 seeded
    for (const k of ['k-1', 'k-3']) {
      await L.nav(page, '/tasks/' + k);
      const links = await page.evaluate(() => [...document.querySelectorAll('.location-card a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), target: a.target, rel: a.rel, deco: getComputedStyle(a).textDecorationLine })));
      log('L2 seeded', k, JSON.stringify(links)); await L.shot(page, 'L2-' + k + '-manager');
    }
    // L4 manager edit / clear on k-2 (no location): add, edit, clear
    await L.nav(page, '/tasks/k-2');
    log('L4 k-2 initial has maps link:', await page.locator('.location-card a').count(), 'Add btn:', await page.getByRole('button', { name: 'Add location' }).count());
    await page.getByRole('button', { name: 'Add location' }).click();
    await page.locator('.location-input__text').fill('https://www.google.com/maps/@24.5,46.5,15z');
    await L.shot(page, 'L4-1-add');
    await page.getByRole('button', { name: 'Save location' }).click(); await page.waitForTimeout(700);
    let t = (await idb(page, 'tasks')).find((x) => x.id === 'k-2');
    log('L4 after add saved:', JSON.stringify({ url: t.location_url, lat: t.location_lat, lng: t.location_lng }), 'links', await page.locator('.location-card a').count());
    await page.getByRole('button', { name: 'Edit location' }).click();
    log('L4 edit prefilled:', await page.locator('.location-input__text').inputValue());
    await page.locator('.location-input__text').fill('30.1, 31.2');
    await page.getByRole('button', { name: 'Save location' }).click(); await page.waitForTimeout(700);
    t = (await idb(page, 'tasks')).find((x) => x.id === 'k-2');
    log('L4 after edit saved:', JSON.stringify({ url: t.location_url, lat: t.location_lat, lng: t.location_lng }));
    await L.shot(page, 'L4-2-edited');
    await page.getByRole('button', { name: 'Edit location' }).click();
    // invalid blocks save
    await page.locator('.location-input__text').fill('http://example.com');
    log('L4 invalid -> save disabled:', await page.getByRole('button', { name: 'Save location' }).isDisabled());
    await page.getByRole('button', { name: 'Clear' }).click();
    await L.shot(page, 'L4-3-clearing');
    await page.getByRole('button', { name: 'Save location' }).click(); await page.waitForTimeout(700);
    t = (await idb(page, 'tasks')).find((x) => x.id === 'k-2');
    log('L4 after clear saved:', JSON.stringify({ url: t.location_url, lat: t.location_lat, lng: t.location_lng }), 'links', await page.locator('.location-card a').count());
    // L3 worker views
    await L.as(page, 'u-wa');
    for (const k of ['k-2']) {
      await L.nav(page, '/tasks/' + k);
      const txt = await bodyText(page);
      log('L3 worker Ahmed', k, '(no location) location-ish text:', /map|location|directions|📍/i.test(txt), 'location-card els:', await page.locator('.location-card').count(), 'edit btns', await page.getByRole('button', { name: /location/i }).count());
      await L.shot(page, 'L3-worker-k-2');
    }
    await L.nav(page, '/tasks/k-4'); log('L3 worker k-4 location-ish:', /map|location|directions|📍/i.test(await bodyText(page)));
    await L.nav(page, '/tasks/k-1');
    const links = await page.evaluate(() => [...document.querySelectorAll('.location-card a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), target: a.target, rel: a.rel })));
    log('L2 worker k-1', JSON.stringify(links), 'edit btn', await page.getByRole('button', { name: /location/i }).count());
    await L.shot(page, 'L2-k-1-worker');
    await L.as(page, 'u-wb'); await L.nav(page, '/tasks/k-3');
    log('L2 worker Sara k-3', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.location-card a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })))));
    await L.shot(page, 'L2-k-3-worker');
    await ctx.close();
  }
  // L5 geolocation granted
  {
    const { ctx, page } = await openCtx(browser, { permissions: ['geolocation'], geolocation: { latitude: 24.774265, longitude: 46.738586 } });
    await L.as(page, 'u-mgr'); await L.nav(page, '/tasks/new');
    await page.getByRole('button', { name: /Use my current location/ }).click(); await page.waitForTimeout(1200);
    log('L5 granted: input=', await page.locator('.location-input__text').inputValue(), 'feedback=', JSON.stringify(await page.locator('.location-input__feedback').allInnerTexts()));
    await L.shot(page, 'L5-granted');
    await ctx.close();
  }
  {
    const { ctx, page } = await openCtx(browser, { permissions: [] });
    await L.as(page, 'u-mgr'); await L.nav(page, '/tasks/new');
    await page.getByRole('button', { name: /Use my current location/ }).click(); await page.waitForTimeout(1500);
    log('L5 denied: input=', JSON.stringify(await page.locator('.location-input__text').inputValue()), 'feedback=', JSON.stringify(await page.locator('.location-input__feedback').allInnerTexts()), 'submit enabled? (needs other fields)');
    await L.shot(page, 'L5-denied');
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });

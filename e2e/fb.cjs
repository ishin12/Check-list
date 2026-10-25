const L = require('./libf.cjs');
(async () => {
  const { browser, page } = await L.open();
  await L.as(page, 'u-wa');
  await page.goto(L.URL + '/tasks/k-4'); await page.waitForTimeout(600);
  await page.locator('.proof-block__open').first().tap(); await page.waitForTimeout(700);
  await L.shot(page, 'P6-viewer');
  const r = await page.evaluate(() => {
    const v = document.querySelector('.viewer'); const cs = getComputedStyle(v);
    const a = document.querySelector('.viewer__actions a');
    const out = { viewerBg: cs.backgroundColor, viewerOpacity: cs.opacity, hasReplace: !!a };
    if (a) { const ac = getComputedStyle(a); out.replaceDecoration = ac.textDecorationLine; out.replaceText = a.textContent; }
    out.stageBg = getComputedStyle(document.querySelector('.viewer__stage')).backgroundColor;
    out.topEl = document.elementFromPoint(5, 400).className;
    return out;
  });
  console.log('P6', JSON.stringify(r));
  await browser.close();
})();

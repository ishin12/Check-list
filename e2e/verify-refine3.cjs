const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5799/');
  await page.waitForFunction(() => window.__demo && window.__demo.listProfiles().length > 0);
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__demo.setActiveUser('u-mgr'));
  await page.goto('http://localhost:5799/tasks/k-4'); await page.waitForTimeout(1200);
  const b = page.locator('.action-bar button').first();
  await b.scrollIntoViewIfNeeded();
  const r = await b.boundingBox();
  await b.click(); await page.waitForTimeout(1000);
  console.log(r, (await page.locator('.task-head__pills').innerText()).replace(/\n/g, ' '));
  await browser.close();
})();

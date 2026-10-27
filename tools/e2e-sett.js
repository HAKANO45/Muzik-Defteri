// Ayarlar testi (v5.0): sabit üst satır, ⌂ ile ana sayfaya dönüş.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, json: {} }));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.setItem('md.lang', 'tr')); await page.reload(); await page.waitForTimeout(800);
  await page.click('#btnSettings'); await page.waitForTimeout(200);
  await page.locator('#modalCard').evaluate(e => e.scrollTop = 700); await page.waitForTimeout(200);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/st1.png' });
  await page.click('.modal-head .mh-btn.mh-home'); await page.waitForTimeout(300);
  console.log('modal hidden after ⌂:', await page.isHidden('#modal'));
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/st2.png' });
  console.log('ERR', errors); await b.close();
})();

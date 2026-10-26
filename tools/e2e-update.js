// Güncelleme testi: arka plandan dönünce yeni sürüm otomatik yüklenir mi?
// Kullanım: siteyi geçici klasöre kopyala (site/), python3 -m http.server 8766 -d site &  ->  node tools/e2e-update.js (v1 ile v2 farklı olmalı)
const { chromium, devices } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, json: {} }));
  await page.goto('http://localhost:8766/'); await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(1000);
  console.log('v1:', await page.evaluate(() => window.__mdVersion), 'controlled:', await page.evaluate(() => !!navigator.serviceWorker.controller));
  // yeni sürüm yayınla
  for (const [f, a, bb] of [['site/sw.js', 'md-v4.3.1', 'md-v9.9.9'], ['site/js/app.js', "VERSION = '4.3.1'", "VERSION = '9.9.9'"]]) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(a, bb));
  // uygulama arka plandan dönüyor
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(4000);
  console.log('v2:', await page.evaluate(() => window.__mdVersion));
  await b.close();
})();

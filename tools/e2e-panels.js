// Panel testi (v4.7): kenar çubuğunu sürükle, liste boyu, listeyi gizle, araç çubuğunu katla — yeniden açılışta kalıcı mı.
// Kullanım: python3 -m http.server 8765 &  ->  SAMPLE=<herhangi.txt> node tools/e2e-panels.js
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, json: {} }));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.setItem('md.lang', 'tr')); await page.reload();
  await page.setInputFiles('#fileTxt', [process.env.SAMPLE]);
  await page.waitForTimeout(800);
  await page.locator('#list .item').first().click(); await page.waitForTimeout(300);
  const sp = await page.locator('#splitter').boundingBox();
  await page.mouse.move(sp.x + 3, sp.y + 300); await page.mouse.down(); await page.mouse.move(sp.x - 90, sp.y + 300, { steps: 5 }); await page.mouse.up();
  await page.click('#listSize button >> nth=1'); await page.click('#listSize button >> nth=1');
  console.log('sideW', await page.evaluate(() => window.__md.settings.sideW), 'listSize', await page.evaluate(() => window.__md.settings.listSize));
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/panels-1.png' });
  await page.click('#songToolbar button[title^="Araç çubuğunu gizle"]'); await page.click('#btnPanel'); await page.waitForTimeout(200);
  console.log('viewer width', (await page.locator('#viewer').boundingBox()).width, 'unfold visible', await page.isVisible('#unfoldBtn'));
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/panels-2.png' });
  await page.reload(); await page.waitForTimeout(1500);
  console.log('after reload hidden:', await page.evaluate(() => [window.__md.settings.sideHidden, window.__md.settings.compact, window.__md.settings.sideW]));
  console.log('ERR', errors); await b.close();
})();

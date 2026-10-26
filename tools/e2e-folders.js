// Regresyon testi (v4.0.2): boş klasör ve ZIP içe aktarma yeniden açılışta korunur mu?
// Kullanım: python3 -m http.server 8765 &  ->  node tools/e2e-folders.js <klasörlü.zip>
// Beklenen: AFTER satırında vdirs boş değil ve tops = ZIP'in üst klasörü.
const { chromium, devices } = require('playwright');
const ZIP = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, json: {} }));
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => localStorage.setItem('md.lang', 'tr')); await page.reload();
  await page.waitForTimeout(500);
  // 1) yeni klasör
  await page.click('button[title="Yeni klasör"]');
  await page.fill('.modal-card input', 'Deneme Klasör'); await page.click('.modal-card >> text=OK');
  await page.waitForTimeout(200);
  console.log('dir after create:', await page.evaluate(() => window.__md.dir));
  await page.click('.crumb >> nth=0');
  // 2) zip içe aktar (kökte)
  await page.setInputFiles('#fileZip', ZIP);
  await page.waitForFunction(() => window.__md.songs.size > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => ({ n: window.__md.songs.size, tops: [...new Set([...window.__md.songs.keys()].map(p => p.split('/')[0]))].slice(0, 12), vdirs: [...window.__md.virtualDirs] }));
  console.log('BEFORE', JSON.stringify(before));
  // uygulamayı kapat / yeniden aç
  await page.reload(); await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({ n: window.__md.songs.size, tops: [...new Set([...window.__md.songs.keys()].map(p => p.split('/')[0]))].slice(0, 12), vdirs: [...window.__md.virtualDirs], dirs: [...window.__md.dirs.get('').dirs] }));
  console.log('AFTER ', JSON.stringify(after));
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/folders-after.png' });
  console.log('ERR', errors);
  await browser.close();
})();

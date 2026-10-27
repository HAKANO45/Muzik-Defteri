// Yazım ayarı (v5.8.0): klasör BÜYÜK, şarkı Baş Harfler Büyük — sadece görünüş
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp'; const puts = [];
async function run(b, name, dev) {
  const page = await (await b.newContext(dev)).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || ''; const m = req.method();
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (m === 'GET') return route.fulfill({ status: 404, json: {} });
    puts.push(path); return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.click('#btnSettings'); await page.click('text=🎨 Görünüm'); await page.waitForTimeout(200);
  await page.locator('.seg').nth(5).locator('button', { hasText: 'BÜYÜK HARF' }).click();
  await page.locator('.seg').nth(6).locator('button', { hasText: 'Baş Harfler Büyük' }).click();
  await page.locator('.case-prev').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${O}/c-${name}1.png` });
  await page.click('.mh-save'); await page.waitForTimeout(400);
  await page.locator('.item.tree-dir', { hasText: /9-8 ROMAN/ }).first().click(); await page.waitForTimeout(500);
  await page.locator('.item.tree-dir', { hasText: /EGE/ }).first().click(); await page.waitForTimeout(500);
  if (name === 'mac') { await page.locator('#list .item[data-p*="Abe kaynana"]').first().click(); await page.waitForTimeout(700); }
  await page.screenshot({ path: `${O}/c-${name}2.png` });
  console.log(name, await page.$$eval('#list .item .name', e => e.slice(0, 8).map(x => x.firstChild.textContent)), 'dosya adı aynı:', await page.evaluate(() => window.__md.songs.has('9-8 Roman/Abe kaynana neyap.txt')));
  console.log('ERR', errors);
}
(async () => {
  const b = await chromium.launch();
  await run(b, 'mac', { viewport: { width: 1440, height: 860 } });
  await run(b, 'iphone', { ...devices['iPhone 13'] });
  console.log('PUT', [...new Set(puts)]);
  await b.close();
})();

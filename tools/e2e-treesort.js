// Ağaçta sıralama (v5.10.1): açık klasörün içindeki şarkılar ▲▼ ve sürükle-bırak ile, çoklu seçim ağaçta
const { chromium } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp';
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || '';
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (req.method() === 'GET') return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.locator('.item.tree-dir', { hasText: '9-8 Roman' }).first().click(); await page.waitForTimeout(500);
  await page.click('.side-head .small-btn:has-text("↕")'); await page.waitForTimeout(200);
  const names = () => page.$$eval('#list .item.tree-song[data-p^="9-8 Roman/"] .name', e => e.slice(0, 4).map(x => x.firstChild.textContent));
  console.log('önce', await names());
  await page.locator('#list .item.tree-song[data-p^="9-8 Roman/"]').nth(2).locator('.sort-btn', { hasText: '▲' }).click(); await page.waitForTimeout(200);
  console.log('▲ sonra', await names());
  const rows = page.locator('#list .item.tree-song[data-p^="9-8 Roman/"]');
  await rows.nth(3).dragTo(rows.nth(0)); await page.waitForTimeout(300);
  console.log('sürükle sonra', await names(), 'kayıt', !!(await page.evaluate(() => window.__md.order.order['9-8 Roman'])));
  await page.screenshot({ path: O + '/ts1.png' });
  await page.click('.nav-pill:has-text("Bitti")');
  await page.click('.side-head .small-btn:has-text("☑")'); await page.waitForTimeout(200);
  await page.locator('#list .item.sel-item[data-p], #list .item.sel-item').nth(1).click(); await page.waitForTimeout(200);
  console.log('seçili', await page.evaluate(() => [...window.__md.sel]));
  await page.screenshot({ path: O + '/ts2.png' });
  console.log('ERR', errors); await b.close();
})();

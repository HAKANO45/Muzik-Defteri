// Klasör ağacı (v5.7.0): klasöre tek dokunuş → içi hemen altında; tekrar → kapanır; çift → menü
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp';
async function run(b, name, dev) {
  const page = await (await b.newContext(dev)).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || '';
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.locator('.item.tree-dir', { hasText: '9-8 Roman' }).first().click(); await page.waitForTimeout(500);
  await page.locator('.item.tree-dir', { hasText: 'EGE' }).first().click(); await page.waitForTimeout(500);
  const dir = await page.evaluate(() => window.__md.dir);
  const n = await page.locator('#list .item').count();
  await page.locator('#list .item[data-p*="EGE"]').first().scrollIntoViewIfNeeded();
  await page.locator('.item.tree-dir', { hasText: '9-8 Roman' }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${O}/t-${name}.png` });
  // ağaçtan şarkı aç
  await page.locator('#list .item[data-p*="EGE"]').first().click(); await page.waitForTimeout(700);
  const cur = await page.evaluate(() => window.__md.current);
  if (name === 'mac') await page.screenshot({ path: `${O}/t-${name}2.png` });
  console.log(name, 'dir hâlâ', JSON.stringify(dir), 'satır', n, 'açılan', cur);
  console.log('ERR', errors);
}
(async () => {
  const b = await chromium.launch();
  await run(b, 'mac', { viewport: { width: 1440, height: 860 } });
  await run(b, 'iphone', { ...devices['iPhone 13'] });
  await b.close();
})();

// Görünüm testi (v5.0): tema + düğme boyutu kaydet, gorunum.json ile 2. cihaza senkron.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
let gor = null; const puts = [];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const acc = req.headers()['accept'] || ''; const m = req.method();
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'gorunum.json' && m === 'GET') return gor ? (acc.includes('raw') ? route.fulfill({ body: gor }) : route.fulfill({ json: { sha: 'g' } })) : route.fulfill({ status: 404, json: {} });
    if (m === 'PUT') { puts.push(path); if (path === 'gorunum.json') gor = Buffer.from(JSON.parse(req.postData()).content, 'base64'); return route.fulfill({ json: { content: { sha: 'x' } } }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(2600);
  await page.click('#btnSettings'); await page.click('text=🎨 Görünüm'); await page.waitForTimeout(200);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/lk1.png' });
  await page.click('.theme-sw:has-text("gündüz")'); await page.click('.seg button:has-text("Büyük")'); await page.waitForTimeout(150);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/lk2.png' });
  await page.click('.btn-row >> text=Kaydet'); await page.waitForTimeout(2500);
  console.log('gorunum.json yüklendi:', gor ? gor.toString().slice(0, 120) : null);
  await page.locator('.item', { hasText: '1.Oyun Havalari' }).first().click();
  await page.locator('.item', { hasText: '2-4 europub' }).first().click();
  await page.locator('#list .item').nth(1).click(); await page.waitForTimeout(300);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/lk3.png' });
  // 2. cihaz: senkronla gelir mi
  const p2 = await (await b.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  await p2.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const acc = req.headers()['accept'] || '';
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'gorunum.json') return acc.includes('raw') ? route.fulfill({ body: gor }) : route.fulfill({ json: { sha: 'g' } });
    return route.fulfill({ status: 404, json: {} });
  });
  await p2.goto('http://localhost:8765/');
  await p2.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await p2.reload();
  await p2.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await p2.waitForTimeout(3000);
  console.log('2. cihaz tema:', await p2.evaluate(() => document.documentElement.dataset.theme), 'ui', await p2.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui')));
  await p2.screenshot({ path: (process.env.OUT || '/tmp') + '/lk4.png' });
  console.log('ERR', errors); await b.close();
})();

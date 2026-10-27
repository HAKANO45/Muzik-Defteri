// Programlar: ↕ ile program sırası ve program içi şarkı sırası (v5.6.0)
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const PROG = fs.readFileSync(process.env.PROG || '../Muzik-Defteri-Repertuar/programlar.json');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp'; const puts = [];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || ''; const m = req.method();
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'programlar.json' && m === 'GET') return acc.includes('raw') ? route.fulfill({ body: PROG }) : route.fulfill({ json: { sha: 'p1' } });
    if (m === 'GET') return route.fulfill({ status: 404, json: {} });
    puts.push([path, req.postData()]); return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.click('#tabs button[data-tab="programs"]'); await page.waitForTimeout(300);
  const names = () => page.$$eval('#list .item .name', e => e.map(x => x.textContent));
  console.log('önce', (await names()).slice(0, 4));
  await page.click('.side-head .small-btn:has-text("↕")'); await page.waitForTimeout(200);
  await page.locator('#list .item').nth(7).locator('.sort-btn', { hasText: '▲' }).click(); await page.waitForTimeout(200);
  await page.locator('#list .item').nth(6).locator('.sort-btn', { hasText: '▲' }).click(); await page.waitForTimeout(200);
  await page.screenshot({ path: O + '/p1.png' });
  await page.click('.nav-pill:has-text("Bitti")');
  console.log('sonra', await names());
  await page.locator('#list .item').first().click(); await page.waitForTimeout(600);
  await page.click('.side-head .small-btn:has-text("↕")'); await page.waitForTimeout(200);
  await page.locator('#list .item').nth(1).locator('.sort-btn', { hasText: '▲' }).click(); await page.waitForTimeout(200);
  await page.screenshot({ path: O + '/p2.png' });
  await page.click('.nav-pill:has-text("Bitti")'); await page.waitForTimeout(300);
  await page.click('#btnSync'); await page.waitForTimeout(2500);
  const pj = puts.find(p => p[0] === 'programlar.json');
  if (pj) { const c = JSON.parse(Buffer.from(JSON.parse(pj[1]).content, 'base64').toString()); console.log('order kaydedildi:', c.order.length, c.orderUpdated > 0); }
  else console.log('programlar.json PUT yok!');
  console.log('ERR', errors); await b.close();
})();

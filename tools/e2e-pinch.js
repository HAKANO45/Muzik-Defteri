// İki parmak testi (v5.2): sadece şarkı yazısı büyür, sayfa yakınlaşması 1 kalır.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const acc = req.headers()['accept'] || '';
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(2600);
  await page.fill('#q', 'kostak'); await page.waitForTimeout(600); await page.locator('#list .item').first().click(); await page.waitForTimeout(300);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/pz1.png' });
  const cdp = await ctx.newCDPSession(page);
  const tp = (x1, x2) => [{ x: x1, y: 500, id: 1 }, { x: x2, y: 500, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(150, 240) });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(150 - i * 6, 240 + i * 6) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  console.log('font after pinch:', await page.evaluate(() => window.__md.settings.font), '| page zoom:', await page.evaluate(() => window.visualViewport.scale), '| overflow:', await page.evaluate(() => document.documentElement.scrollWidth));
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/pz2.png' });
  console.log('ERR', errors); await b.close();
})();

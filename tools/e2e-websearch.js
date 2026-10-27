// İnternette ara sayfası (v5.4.0): iPhone, Android, Windows
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp';
async function run(b, name, dev) {
  const ctx = await b.newContext(dev); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const opened = []; ctx.on('page', p => opened.push(p.url()));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || '';
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route('https://www.google.com/**', r => r.fulfill({ body: 'google' }));
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(2000);
  await page.fill('#q', 'Yıldız Tilbe'); await page.waitForTimeout(900);
  await page.click('.side-head button:has-text("İnternette ara")'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${O}/ws-${name}.png` });
  await page.click('.ws-go'); await page.waitForTimeout(800);
  console.log(name, 'açılan:', opened, 'ERR', errors);
  await ctx.close();
}
(async () => {
  const b = await chromium.launch();
  await run(b, 'iphone', { ...devices['iPhone 13'] });
  await run(b, 'android', { ...devices['Pixel 7'] });
  await run(b, 'windows', { viewport: { width: 1280, height: 800 } });
  await b.close();
})();

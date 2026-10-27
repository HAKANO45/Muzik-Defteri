// iPhone ⋯ sayfasında not düğmesi (v5.3.1)
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const puts = [];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
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
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(2600);
  await page.evaluate(() => window.__mdGo('KINA')); await page.waitForTimeout(500);
  await page.locator('#list .item[data-p]').first().click(); await page.waitForTimeout(800);
  const O = process.env.OUT || '/tmp';
  await page.click('#phoneBar button:has-text("⋯")'); await page.waitForTimeout(300);
  await page.screenshot({ path: O + '/n1.png' });
  await page.click('.sheet-note-btn'); await page.waitForTimeout(300);
  await page.screenshot({ path: O + '/n2.png' });
  const inputs = page.locator('.modal-card input');
  await inputs.first().fill('Eylem');
  console.log('inputs', await inputs.count());
  await page.screenshot({ path: O + '/n2b.png', fullPage: false });
  await page.locator('.modal-card button', { hasText: /Kaydet|OK/ }).last().click(); await page.waitForTimeout(600);
  await page.click('#phoneBar button:has-text("⋯")'); await page.waitForTimeout(300);
  await page.screenshot({ path: O + '/n3.png' });
  await page.click('.sheet-close'); await page.click('#btnSync'); await page.waitForTimeout(2500);
  console.log('PUT', puts); console.log('ERR', errors); await b.close();
})();

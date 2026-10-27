// iPhone klasör menüsü testi (v5.1): basılı tut (contextmenu) → taşı / kopyala / yeniden adlandır (Git Data API taklit).
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const trees = [], commits = [];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const acc = req.headers()['accept'] || ''; const m = req.method(); const u = url.pathname;
    if (u.endsWith('/git/ref/heads/main')) return route.fulfill({ json: { object: { sha: 'h' } } });
    if (u.includes('/git/commits/') && m === 'GET') return route.fulfill({ json: { tree: { sha: 't0' } } });
    if (u.endsWith('/git/trees')) { trees.push(JSON.parse(req.postData())); return route.fulfill({ json: { sha: 't' + trees.length } }); }
    if (u.endsWith('/git/commits') && m === 'POST') { commits.push(JSON.parse(req.postData()).message); return route.fulfill({ json: { sha: 'c' } }); }
    if (u.includes('/git/refs/heads/main')) return route.fulfill({ json: {} });
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (m === 'GET') return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(2600);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/fm1.png' });
  await page.locator('.item', { hasText: 'KINA' }).first().dispatchEvent('contextmenu'); await page.waitForTimeout(250);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/fm2.png' });
  await page.click('.sheet-act:has-text("Taşı")'); await page.waitForTimeout(250);
  await page.fill('.modal-card input', 'halay'); await page.waitForTimeout(150);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/fm3.png' });
  await page.locator('.folder-pick .item', { hasText: 'Halay' }).first().click(); await page.waitForTimeout(1200);
  console.log('taşı ->', await page.evaluate(() => window.__md.dir), commits);
  await page.click('.nav-pill:has-text("Üst klasör")');
  await page.locator('.item', { hasText: 'KINA' }).first().dispatchEvent('contextmenu');
  await page.click('.sheet-act:has-text("Kopyala")'); await page.fill('.modal-card input', 'halay'); await page.waitForTimeout(150); await page.locator('.folder-pick .item').filter({ has: page.locator('.name', { hasText: /^Halay$/ }) }).first().click(); await page.waitForTimeout(1200);
  console.log('kopyala ->', await page.evaluate(() => window.__md.dir), commits.slice(-1), 'ağaç girdisi', trees[trees.length-1].tree.length, 'silme', trees[trees.length-1].tree.filter(e=>e.sha===null).length);
  await page.click('.nav-pill:has-text("Üst klasör")').catch(() => {});
  await page.locator('.item', { hasText: 'KINA (kopya)' }).first().dispatchEvent('contextmenu');
  await page.click('.sheet-act:has-text("Yeniden adlandır")'); await page.fill('.modal-card input', 'Kına Havaları'); await page.click('.modal-card >> text=OK'); await page.waitForTimeout(1200);
  console.log('ad ->', await page.evaluate(() => window.__md.dir), commits.slice(-1));
  console.log('ERR', errors); await b.close();
})();

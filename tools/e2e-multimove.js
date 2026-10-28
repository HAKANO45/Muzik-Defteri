// Ağaçta farklı klasörlerden çoklu seç → başka klasöre taşı (tek commit)
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp'; const trees = [], commits = [];
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ ...(process.env.DESK ? { viewport: { width: 1440, height: 900 } } : devices['iPhone 13']) })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || ''; const m = req.method();
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
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.locator('.item.tree-dir', { hasText: 'KINA' }).first().click(); await page.waitForTimeout(400);
  await page.locator('.item.tree-dir', { hasText: '9-8 Roman' }).first().click(); await page.waitForTimeout(400);
  await page.click('.side-head .small-btn:has-text("☑")'); await page.waitForTimeout(200);
  const pick = async txt => { await page.locator('#list .item.sel-item', { hasText: txt }).first().click(); await page.waitForTimeout(150); };
  await pick('Hap koydum'); await pick('Babuba'); await pick('kinayi getir');
  await page.screenshot({ path: O + '/mm1.png' });
  if (process.env.DESK) {
    page.once('dialog', d => d.accept());
    const src = page.locator('#list .item.sel-item', { hasText: 'Babuba' }).first();
    const dst = page.locator('.item.tree-dir').filter({ has: page.locator('.name', { hasText: /^Halay$/ }) }).first();
    const dt = await page.evaluateHandle(() => new DataTransfer());
    await src.dispatchEvent('dragstart', { dataTransfer: dt });
    await dst.dispatchEvent('dragover', { dataTransfer: dt }); await page.waitForTimeout(150);
    await page.screenshot({ path: O + '/mm-over.png' });
    await dst.dispatchEvent('drop', { dataTransfer: dt }); await page.waitForTimeout(300);
    await src.dispatchEvent('dragend', { dataTransfer: dt });
    await page.waitForTimeout(400); await page.screenshot({ path: O + '/mm-drop.png' });
    await page.click('.modal-card >> text=OK').catch(() => {}); await page.waitForTimeout(1500);
    console.log('commit', commits, 'girdi', trees.flatMap(t => t.tree).map(e => e.path + (e.sha === null ? ' (sil)' : '')));
    console.log('ERR', errors); await b.close(); return;
  }
  await page.click('.sel-act:has-text("Taşı")'); await page.waitForTimeout(250);
  await page.fill('.modal-card input', 'istek'); await page.waitForTimeout(150);
  await page.screenshot({ path: O + '/mm2.png' });
  await page.locator('.folder-pick .item').first().click(); await page.waitForTimeout(1500);
  console.log('commit', commits, 'girdi', trees.flatMap(t => t.tree).map(e => e.path + (e.sha === null ? ' (sil)' : '')));
  console.log('dir', await page.evaluate(() => window.__md.dir));
  await page.screenshot({ path: O + '/mm3.png' });
  console.log('ERR', errors); await b.close();
})();

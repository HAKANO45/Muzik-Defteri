// 🏷 Not penceresi: usul, ton düğmeleri, makam, org kaydı, style düğmeleri (v5.16.0)
const { chromium } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const SOZ = fs.readFileSync(process.env.SOZ || '../Muzik-Defteri-Repertuar/bundle/sozluk.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp'; const puts = [], blobs = [], trees = [], commits = [];
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || ''; const m = req.method();
    if (u.endsWith('/git/ref/heads/main')) return route.fulfill({ json: { object: { sha: 'h' } } });
    if (u.includes('/git/commits/') && m === 'GET') return route.fulfill({ json: { tree: { sha: 't0' } } });
    if (u.endsWith('/git/blobs')) { blobs.push(JSON.parse(req.postData())); return route.fulfill({ json: { sha: 'b' + blobs.length } }); }
    if (u.endsWith('/git/trees')) { trees.push(JSON.parse(req.postData())); return route.fulfill({ json: { sha: 't' + trees.length } }); }
    if (u.endsWith('/git/commits') && m === 'POST') { commits.push(JSON.parse(req.postData()).message); return route.fulfill({ json: { sha: 'c' } }); }
    if (u.endsWith('/git/refs') && m === 'POST') { commits.push('BRANCH ' + JSON.parse(req.postData()).ref); return route.fulfill({ json: {} }); }
    if (u.includes('/git/refs/heads/main')) return route.fulfill({ json: {} });
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'bundle/sozluk.json.gz') return acc.includes('raw') ? route.fulfill({ body: SOZ }) : route.fulfill({ json: { sha: 'soz1' } });
    if (m === 'GET') return route.fulfill({ status: 404, json: {} });
    puts.push([path, req.postData()]); return route.fulfill({ json: { content: { sha: 'x' + puts.length } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.fill('#q', 'dane dane'); await page.waitForTimeout(800);
  const P = await page.locator('#list .item[data-p*="2-4"]').first().getAttribute('data-p'); console.log('şarkı', P);
  await page.locator('#list .item[data-p*="2-4"]').first().click(); await page.waitForTimeout(700); await page.fill('#q', ''); await page.waitForTimeout(300);
  await page.click('.chip-add'); await page.waitForTimeout(400);
  console.log('usul hazır', await page.$$eval('.note-chips .nc.on', e => e.map(x => x.textContent)));
  await page.screenshot({ path: O + '/n1.png' });
  await page.click('.note-chips .nc:has-text("FA#")'); await page.click('.note-chips .nc:has-text("m (minör)")');
  await page.click('.note-chips .nc:has-text("Hicaz")');
  await page.locator('.note-chips .nc.add').nth(1).click(); await page.fill('.nc-new', 'Saba'); await page.keyboard.press('Enter');
  await page.fill('.modal-card input[placeholder^="Ketron"]', 'USER 12'); await page.fill('.modal-card input[placeholder^="Eylem"]', 'Eylem');
  await page.screenshot({ path: O + '/n2.png' });
  await page.click('.modal-card .btn.primary'); await page.waitForTimeout(500);
  console.log('not', JSON.stringify(await page.evaluate(() => window.__md.notes.notes[window.__md.current])), JSON.stringify(await page.evaluate(() => window.__md.notes.extra)));
  await page.screenshot({ path: O + '/n3.png' });
  await page.fill('#q', 'saba'); await page.waitForTimeout(800);
  console.log('arama saba ilk', await page.$$eval('#list .item[data-p]', e => e.slice(0, 2).map(x => x.dataset.p)));
  console.log('ERR', errors); await b.close();
})();

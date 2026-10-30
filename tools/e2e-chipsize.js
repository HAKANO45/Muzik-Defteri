// Not etiketleri boyutu: gizle / küçük / orta / büyük (v5.17.1)
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
  const P = await page.locator('#list .item[data-p]').first().getAttribute('data-p');
  await page.evaluate(P => { window.__md.notes.notes[P] = { solist: 'Hakan', ton: 'Si', usul: '', makam: 'Kürdi', bpm: 80, style: 'Vahde Arabesk', updated: Date.now() }; }, P);
  await page.locator('#list .item[data-p]').first().click(); await page.waitForTimeout(700);
  for (const k of ['s', 'm', 'l']) {
    await page.evaluate(k => { const r = document.documentElement; r.style.setProperty('--chipk', { s: 0.65, m: 0.8, l: 1 }[k]); }, k);
    await page.screenshot({ path: O + '/c-' + k + '.png', clip: { x: 345, y: 120, width: 900, height: 110 } });
  }
  await page.click('#btnSettings'); await page.waitForTimeout(400);
  await page.click('.btn.primary:has-text("Görünüm")'); await page.waitForTimeout(400);
  await page.locator('.seg button:has-text("Orta")').scrollIntoViewIfNeeded();
  await page.screenshot({ path: O + '/c-set.png' });
  console.log('ERR', errors); await b.close();
})();
